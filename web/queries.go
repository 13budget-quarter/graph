package main

import (
	"database/sql"
	"fmt"
)

func queryStats(db *sql.DB) (DBStats, error) {
	var s DBStats
	err := db.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&s.Nodes)
	if err != nil {
		return s, fmt.Errorf("queryStats nodes: %w", err)
	}
	err = db.QueryRow(`SELECT COUNT(*) FROM edges`).Scan(&s.Edges)
	if err != nil {
		return s, fmt.Errorf("queryStats edges: %w", err)
	}
	err = db.QueryRow(`SELECT COUNT(*) FROM dashboard_package_treemap WHERE total_loc > 0`).Scan(&s.Packages)
	if err != nil {
		return s, fmt.Errorf("queryStats packages: %w", err)
	}
	err = db.QueryRow(`SELECT COUNT(*) FROM nodes WHERE kind = 'function' AND name != 'func literal'`).Scan(&s.Functions)
	if err != nil {
		return s, fmt.Errorf("queryStats functions: %w", err)
	}
	err = db.QueryRow(`SELECT COUNT(DISTINCT file) FROM nodes WHERE file IS NOT NULL AND file != ''`).Scan(&s.Files)
	if err != nil {
		return s, fmt.Errorf("queryStats files: %w", err)
	}

	modRows, err := db.Query(`
		SELECT DISTINCT CASE
			WHEN package LIKE '%/prometheus/prometheus/%' THEN 'prometheus'
			WHEN package LIKE '%client_golang%' THEN 'client_golang'
			WHEN package LIKE '%prometheus-adapter%' THEN 'adapter'
			WHEN package LIKE '%alertmanager%' THEN 'alertmanager'
			ELSE 'other'
		END AS module
		FROM dashboard_package_treemap
		WHERE total_loc > 0
		ORDER BY module`)
	if err != nil {
		return s, fmt.Errorf("queryStats modules: %w", err)
	}
	defer modRows.Close()
	for modRows.Next() {
		var m string
		if err := modRows.Scan(&m); err != nil {
			return s, fmt.Errorf("queryStats modules scan: %w", err)
		}
		s.Modules = append(s.Modules, m)
	}
	if s.Modules == nil {
		s.Modules = []string{}
	}
	return s, modRows.Err()
}

func queryModules(db *sql.DB) ([]ModuleInfo, error) {
	rows, err := db.Query(`
		SELECT
			CASE
				WHEN package LIKE '%/prometheus/prometheus/%' THEN 'prometheus'
				WHEN package LIKE '%client_golang%' THEN 'client_golang'
				WHEN package LIKE '%prometheus-adapter%' THEN 'adapter'
				WHEN package LIKE '%alertmanager%' THEN 'alertmanager'
				ELSE 'other'
			END AS module,
			COUNT(*) AS pkg_count,
			SUM(function_count) AS fn_count,
			SUM(total_loc) AS total_loc,
			SUM(total_complexity) AS total_complexity
		FROM dashboard_package_treemap
		WHERE total_loc > 0
		GROUP BY module
		ORDER BY total_loc DESC`)
	if err != nil {
		return nil, fmt.Errorf("queryModules: %w", err)
	}
	defer rows.Close()

	var modules []ModuleInfo
	for rows.Next() {
		var m ModuleInfo
		if err := rows.Scan(&m.Name, &m.Packages, &m.Functions, &m.LOC, &m.Complexity); err != nil {
			return nil, fmt.Errorf("queryModules scan: %w", err)
		}
		modules = append(modules, m)
	}
	return modules, rows.Err()
}

func queryPackages(db *sql.DB) ([]PackageInfo, error) {
	rows, err := db.Query(`
		SELECT
			t.package,
			t.file_count,
			t.function_count,
			t.type_count,
			t.total_loc,
			t.total_complexity,
			COALESCE(doc.name, '') AS description
		FROM dashboard_package_treemap t
		LEFT JOIN (
			SELECT package, name,
			       ROW_NUMBER() OVER (PARTITION BY package ORDER BY LENGTH(name) DESC) AS rn
			FROM nodes
			WHERE kind = 'comment' AND name LIKE 'Package %'
		) doc ON doc.package = t.package AND doc.rn = 1
		WHERE t.total_loc > 0
		ORDER BY t.total_loc DESC`)
	if err != nil {
		return nil, fmt.Errorf("queryPackages: %w", err)
	}
	defer rows.Close()

	var pkgs []PackageInfo
	for rows.Next() {
		var p PackageInfo
		if err := rows.Scan(&p.Package, &p.Files, &p.Functions, &p.Types, &p.LOC, &p.Complexity, &p.Description); err != nil {
			return nil, fmt.Errorf("queryPackages scan: %w", err)
		}
		pkgs = append(pkgs, p)
	}
	return pkgs, rows.Err()
}

func queryPackageGraph(db *sql.DB) (GraphResponse, error) {
	edgeRows, err := db.Query(`SELECT source, target, weight FROM dashboard_package_graph ORDER BY weight DESC`)
	if err != nil {
		return GraphResponse{}, fmt.Errorf("queryPackageGraph edges: %w", err)
	}
	defer edgeRows.Close()

	nodeSet := make(map[string]bool)
	var edges []EdgeDTO
	for edgeRows.Next() {
		var e EdgeDTO
		if err := edgeRows.Scan(&e.Source, &e.Target, &e.Weight); err != nil {
			return GraphResponse{}, fmt.Errorf("queryPackageGraph edge scan: %w", err)
		}
		e.Kind = "imports"
		edges = append(edges, e)
		nodeSet[e.Source] = true
		nodeSet[e.Target] = true
	}
	if err := edgeRows.Err(); err != nil {
		return GraphResponse{}, err
	}

	treemapRows, err := db.Query(`SELECT package, total_loc, total_complexity FROM dashboard_package_treemap`)
	if err != nil {
		return GraphResponse{}, fmt.Errorf("queryPackageGraph treemap: %w", err)
	}
	defer treemapRows.Close()

	type treemapInfo struct {
		loc        int
		complexity int
	}
	treemap := make(map[string]treemapInfo)
	for treemapRows.Next() {
		var pkg string
		var loc, complexity int
		if err := treemapRows.Scan(&pkg, &loc, &complexity); err != nil {
			return GraphResponse{}, fmt.Errorf("queryPackageGraph treemap scan: %w", err)
		}
		treemap[pkg] = treemapInfo{loc: loc, complexity: complexity}
	}
	if err := treemapRows.Err(); err != nil {
		return GraphResponse{}, err
	}

	var nodes []NodeDTO
	for pkg := range nodeSet {
		n := NodeDTO{ID: pkg, Kind: "package", Name: pkg}
		if info, ok := treemap[pkg]; ok {
			n.Line = info.loc
		}
		nodes = append(nodes, n)
	}

	return GraphResponse{Nodes: nodes, Edges: edges}, nil
}

func queryPackagesByModule(db *sql.DB, module string) ([]PackageInfo, error) {
	var pattern string
	switch module {
	case "prometheus":
		pattern = "%/prometheus/prometheus/%"
	case "client_golang":
		pattern = "%client_golang%"
	case "adapter":
		pattern = "%prometheus-adapter%"
	case "alertmanager":
		pattern = "%alertmanager%"
	default:
		pattern = ""
	}

	const docJoin = `
		LEFT JOIN (
			SELECT package, name,
			       ROW_NUMBER() OVER (PARTITION BY package ORDER BY LENGTH(name) DESC) AS rn
			FROM nodes
			WHERE kind = 'comment' AND name LIKE 'Package %'
		) doc ON doc.package = t.package AND doc.rn = 1`

	var query string
	var args []any

	if pattern != "" {
		query = `
			SELECT t.package, t.file_count, t.function_count, t.type_count, t.total_loc, t.total_complexity, COALESCE(doc.name, '')
			FROM dashboard_package_treemap t` + docJoin + `
			WHERE t.total_loc > 0 AND t.package LIKE ?
			ORDER BY t.total_loc DESC`
		args = append(args, pattern)
	} else if module == "other" {
		query = `
			SELECT t.package, t.file_count, t.function_count, t.type_count, t.total_loc, t.total_complexity, COALESCE(doc.name, '')
			FROM dashboard_package_treemap t` + docJoin + `
			WHERE t.total_loc > 0
			  AND t.package NOT LIKE '%/prometheus/prometheus/%'
			  AND t.package NOT LIKE '%client_golang%'
			  AND t.package NOT LIKE '%prometheus-adapter%'
			  AND t.package NOT LIKE '%alertmanager%'
			ORDER BY t.total_loc DESC`
	} else {
		return queryPackages(db)
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("queryPackagesByModule: %w", err)
	}
	defer rows.Close()

	var pkgs []PackageInfo
	for rows.Next() {
		var p PackageInfo
		if err := rows.Scan(&p.Package, &p.Files, &p.Functions, &p.Types, &p.LOC, &p.Complexity, &p.Description); err != nil {
			return nil, fmt.Errorf("queryPackagesByModule scan: %w", err)
		}
		p.Module = module
		pkgs = append(pkgs, p)
	}
	return pkgs, rows.Err()
}

func queryPackageFunctions(db *sql.DB, pkg string) ([]FunctionInfo, error) {
	rows, err := db.Query(`
		SELECT name, COALESCE(file,''), COALESCE(line,0)
		FROM nodes
		WHERE package = ? AND kind = 'function'
		ORDER BY name`, pkg)
	if err != nil {
		return nil, fmt.Errorf("queryPackageFunctions: %w", err)
	}
	defer rows.Close()

	var funcs []FunctionInfo
	for rows.Next() {
		var f FunctionInfo
		if err := rows.Scan(&f.Name, &f.File, &f.Line); err != nil {
			return nil, fmt.Errorf("queryPackageFunctions scan: %w", err)
		}
		funcs = append(funcs, f)
	}
	return funcs, rows.Err()
}
