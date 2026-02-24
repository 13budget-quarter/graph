package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

func newRouter(db *sql.DB) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/stats", handleStats(db))
	mux.HandleFunc("GET /api/modules", handleModules(db))
	mux.HandleFunc("GET /api/packages", handlePackages(db))
	mux.HandleFunc("GET /api/packages/graph", handlePackageGraph(db))
	mux.HandleFunc("GET /api/packages/functions/{pkg...}", handlePackageFunctions(db))
	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode error: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func handleStats(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stats, err := queryStats(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, stats)
	}
}

func handleModules(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		modules, err := queryModules(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if modules == nil {
			modules = []ModuleInfo{}
		}
		writeJSON(w, http.StatusOK, modules)
	}
}

func handlePackages(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		module := r.URL.Query().Get("module")
		var pkgs []PackageInfo
		var err error
		if module != "" {
			pkgs, err = queryPackagesByModule(db, module)
		} else {
			pkgs, err = queryPackages(db)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if pkgs == nil {
			pkgs = []PackageInfo{}
		}
		writeJSON(w, http.StatusOK, pkgs)
	}
}

func handlePackageGraph(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		g, err := queryPackageGraph(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if g.Nodes == nil {
			g.Nodes = []NodeDTO{}
		}
		if g.Edges == nil {
			g.Edges = []EdgeDTO{}
		}
		writeJSON(w, http.StatusOK, g)
	}
}

func handlePackageFunctions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pkg := r.PathValue("pkg")
		if pkg == "" {
			writeError(w, http.StatusBadRequest, "missing package name")
			return
		}
		funcs, err := queryPackageFunctions(db, pkg)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if funcs == nil {
			funcs = []FunctionInfo{}
		}
		writeJSON(w, http.StatusOK, funcs)
	}
}
