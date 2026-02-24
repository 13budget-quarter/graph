package main

import (
	"database/sql"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"

	_ "modernc.org/sqlite"
)

//go:embed all:frontend/build
var frontendFS embed.FS

func run() error {
	dbPath := flag.String("db", "", "path to CPG SQLite database")
	port := flag.Int("port", 8080, "HTTP server port")
	flag.Parse()

	// Allow env vars to override flags
	if *dbPath == "" {
		*dbPath = os.Getenv("CPG_DB_PATH")
	}
	if *dbPath == "" {
		return fmt.Errorf("database path required: use -db flag or CPG_DB_PATH env var")
	}
	if envPort := os.Getenv("CPG_PORT"); envPort != "" {
		fmt.Sscanf(envPort, "%d", port)
	}

	// Open database read-only
	db, err := sql.Open("sqlite", *dbPath+"?mode=ro")
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	// Set SQLite pragmas for read performance
	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA mmap_size=268435456",
		"PRAGMA cache_size=-65536",
	} {
		if _, err := db.Exec(pragma); err != nil {
			log.Printf("warning: %s: %v", pragma, err)
		}
	}

	// Verify database is accessible
	if err := db.Ping(); err != nil {
		return fmt.Errorf("database ping: %w", err)
	}

	db.SetMaxOpenConns(4)

	// Set up routes
	mux := newRouter(db)

	// Serve frontend static files
	frontendSub, err := fs.Sub(frontendFS, "frontend/build")
	if err != nil {
		return fmt.Errorf("frontend fs: %w", err)
	}
	fileServer := http.FileServer(http.FS(frontendSub))

	// Wrap the main mux to fall back to frontend for non-API routes (SPA)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// API routes go to the mux
		if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
			mux.ServeHTTP(w, r)
			return
		}
		// Try to serve a real static file first (JS, CSS, images, etc.).
		// If the file doesn't exist, fall back to index.html for SPA routing.
		path := r.URL.Path
		if path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}
		// Strip leading slash and check if the file exists in the embedded FS.
		name := path[1:]
		if f, err := frontendSub.Open(name); err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// File not found → serve index.html so the SPA router handles the path.
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("CPG Explorer listening on http://localhost%s", addr)
	return http.ListenAndServe(addr, handler)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
