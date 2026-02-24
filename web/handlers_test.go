package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	_ "modernc.org/sqlite"
)

func setupTestServer(t *testing.T) *httptest.Server {
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
	mux := newRouter(db)
	srv := httptest.NewServer(mux)
	t.Cleanup(func() {
		srv.Close()
		db.Close()
	})
	return srv
}

func getJSON(t *testing.T, url string, v any) *http.Response {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	if v != nil {
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatal("read body:", err)
		}
		if err := json.Unmarshal(body, v); err != nil {
			t.Fatalf("unmarshal %s: %v\nbody: %s", url, err, string(body))
		}
	}
	return resp
}

func TestHandlePackages_Success(t *testing.T) {
	srv := setupTestServer(t)
	var pkgs []PackageInfo
	resp := getJSON(t, srv.URL+"/api/packages", &pkgs)
	if resp.StatusCode != 200 {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	if len(pkgs) != 3 {
		t.Errorf("expected 3 packages, got %d", len(pkgs))
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type: want application/json, got %s", ct)
	}
}

func TestHandlePackageGraph_Success(t *testing.T) {
	srv := setupTestServer(t)
	var g GraphResponse
	resp := getJSON(t, srv.URL+"/api/packages/graph", &g)
	if resp.StatusCode != 200 {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	if len(g.Nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(g.Nodes))
	}
	if len(g.Edges) != 3 {
		t.Errorf("expected 3 edges, got %d", len(g.Edges))
	}
}

func TestCORSHeaders(t *testing.T) {
	srv := setupTestServer(t)
	resp, err := http.Get(srv.URL + "/api/packages")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("CORS header: want *, got %q", got)
	}
}

func TestJSONContentType(t *testing.T) {
	srv := setupTestServer(t)
	resp, err := http.Get(srv.URL + "/api/packages")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type: want application/json, got %s", ct)
	}
}
