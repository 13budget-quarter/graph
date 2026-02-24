package main

import (
	"database/sql"
	"os"
	"testing"

	_ "modernc.org/sqlite"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal("open memory db:", err)
	}
	fixture, err := os.ReadFile("testdata/fixture.sql")
	if err != nil {
		db.Close()
		t.Fatal("read fixture:", err)
	}
	if _, err := db.Exec(string(fixture)); err != nil {
		db.Close()
		t.Fatal("exec fixture:", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestQueryPackages_ReturnsAllPackages(t *testing.T) {
	t.Parallel()
	db := testDB(t)
	pkgs, err := queryPackages(db)
	if err != nil {
		t.Fatal("queryPackages:", err)
	}
	if len(pkgs) != 3 {
		t.Fatalf("expected 3 packages, got %d", len(pkgs))
	}
	found := false
	for _, p := range pkgs {
		if p.Package == "handler" {
			found = true
			if p.Functions != 3 {
				t.Errorf("handler functions: want 3, got %d", p.Functions)
			}
			if p.LOC != 250 {
				t.Errorf("handler LOC: want 250, got %d", p.LOC)
			}
		}
	}
	if !found {
		t.Error("package 'handler' not found")
	}
}

func TestQueryPackageGraph_ReturnsGraph(t *testing.T) {
	t.Parallel()
	db := testDB(t)
	g, err := queryPackageGraph(db)
	if err != nil {
		t.Fatal("queryPackageGraph:", err)
	}
	if len(g.Nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(g.Nodes))
	}
	if len(g.Edges) != 3 {
		t.Errorf("expected 3 edges, got %d", len(g.Edges))
	}
	for _, e := range g.Edges {
		if e.Weight <= 0 {
			t.Errorf("edge %s->%s has weight %d, want >0", e.Source, e.Target, e.Weight)
		}
	}
}

func TestQueryStats_ReturnsCounts(t *testing.T) {
	t.Parallel()
	db := testDB(t)
	stats, err := queryStats(db)
	if err != nil {
		t.Fatal("queryStats:", err)
	}
	if stats.Nodes == 0 {
		t.Error("expected non-zero node count")
	}
	if stats.Edges == 0 {
		t.Error("expected non-zero edge count")
	}
	if stats.Packages != 3 {
		t.Errorf("expected 3 packages, got %d", stats.Packages)
	}
	if stats.Functions == 0 {
		t.Error("expected non-zero function count")
	}
	if stats.Files == 0 {
		t.Error("expected non-zero file count")
	}
	if len(stats.Modules) == 0 {
		t.Error("expected non-empty modules list")
	}
}

func TestQueryModules_ReturnsModules(t *testing.T) {
	t.Parallel()
	db := testDB(t)
	modules, err := queryModules(db)
	if err != nil {
		t.Fatal("queryModules:", err)
	}
	if len(modules) == 0 {
		t.Fatal("expected at least 1 module")
	}
	for _, m := range modules {
		if m.Name == "" {
			t.Error("module has empty name")
		}
		if m.Packages == 0 {
			t.Errorf("module %s has 0 packages", m.Name)
		}
	}
}

func TestQueryPackagesByModule_Default(t *testing.T) {
	t.Parallel()
	db := testDB(t)
	pkgs, err := queryPackagesByModule(db, "other")
	if err != nil {
		t.Fatal("queryPackagesByModule:", err)
	}
	if len(pkgs) != 3 {
		t.Errorf("expected 3 packages for 'other', got %d", len(pkgs))
	}
}

func TestQueryPackagesByModule_NoFilter(t *testing.T) {
	t.Parallel()
	db := testDB(t)
	pkgs, err := queryPackagesByModule(db, "")
	if err != nil {
		t.Fatal("queryPackagesByModule:", err)
	}
	if len(pkgs) != 3 {
		t.Errorf("expected 3 packages for empty module, got %d", len(pkgs))
	}
}
