-- Minimal CPG fixture for unit tests.
-- Contains enough data to exercise all query functions.

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    file TEXT,
    line INTEGER,
    col INTEGER,
    end_line INTEGER,
    package TEXT,
    parent_function TEXT,
    type_info TEXT,
    properties TEXT
);

CREATE TABLE IF NOT EXISTS edges (
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    properties TEXT
);

CREATE TABLE IF NOT EXISTS sources (
    file TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    package TEXT
);

CREATE TABLE IF NOT EXISTS metrics (
    function_id TEXT PRIMARY KEY,
    cyclomatic_complexity INTEGER,
    fan_in INTEGER,
    fan_out INTEGER,
    loc INTEGER,
    num_params INTEGER
);

CREATE TABLE IF NOT EXISTS symbol_index (
    id TEXT,
    name TEXT,
    kind TEXT,
    package TEXT,
    file TEXT,
    line INTEGER
);

CREATE TABLE IF NOT EXISTS dashboard_package_graph (
    source TEXT,
    target TEXT,
    weight INTEGER
);

CREATE TABLE IF NOT EXISTS dashboard_package_treemap (
    package TEXT PRIMARY KEY,
    file_count INTEGER,
    function_count INTEGER,
    total_loc INTEGER,
    total_complexity INTEGER,
    avg_complexity REAL,
    max_complexity INTEGER,
    type_count INTEGER,
    interface_count INTEGER
);

CREATE TABLE IF NOT EXISTS stats_packages (
    package TEXT,
    files INTEGER,
    functions INTEGER,
    types INTEGER,
    loc INTEGER
);

CREATE TABLE IF NOT EXISTS dashboard_function_detail (
    function_id TEXT,
    name TEXT,
    package TEXT,
    file TEXT,
    line INTEGER,
    complexity INTEGER,
    loc INTEGER,
    fan_in INTEGER,
    fan_out INTEGER,
    num_params INTEGER,
    callers TEXT,
    callees TEXT
);

CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_package ON nodes(package);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_function);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source, kind);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target, kind);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);

-- === Packages ===

INSERT INTO nodes VALUES ('pkg::server', 'package', 'server', NULL, 0, 0, 0, 'server', NULL, NULL, NULL);
INSERT INTO nodes VALUES ('pkg::handler', 'package', 'handler', NULL, 0, 0, 0, 'handler', NULL, NULL, NULL);
INSERT INTO nodes VALUES ('pkg::db', 'package', 'db', NULL, 0, 0, 0, 'db', NULL, NULL, NULL);

-- === Functions ===

INSERT INTO nodes VALUES ('server::main@main.go:10:1', 'function', 'main', 'main.go', 10, 1, 30, 'server', NULL, 'func()', NULL);
INSERT INTO nodes VALUES ('server::handleRequest@server.go:20:1', 'function', 'handleRequest', 'server.go', 20, 1, 50, 'server', NULL, 'func(w http.ResponseWriter, r *http.Request)', NULL);
INSERT INTO nodes VALUES ('handler::ProcessData@handler.go:15:1', 'function', 'ProcessData', 'handler.go', 15, 1, 45, 'handler', NULL, 'func(data []byte) (Result, error)', NULL);
INSERT INTO nodes VALUES ('handler::ValidateInput@handler.go:60:1', 'function', 'ValidateInput', 'handler.go', 60, 1, 80, 'handler', NULL, 'func(input string) error', NULL);
INSERT INTO nodes VALUES ('handler::Transform@handler.go:85:1', 'function', 'Transform', 'handler.go', 85, 1, 110, 'handler', NULL, 'func(r Result) Output', NULL);
INSERT INTO nodes VALUES ('db::Query@db.go:10:1', 'function', 'Query', 'db.go', 10, 1, 35, 'db', NULL, 'func(ctx context.Context, q string) (Rows, error)', NULL);
INSERT INTO nodes VALUES ('db::Connect@db.go:40:1', 'function', 'Connect', 'db.go', 40, 1, 55, 'db', NULL, 'func(dsn string) (*DB, error)', NULL);

-- External function stub (no source)
INSERT INTO nodes VALUES ('ext::fmt.Println', 'function', 'fmt.Println', NULL, 0, 0, 0, 'fmt', NULL, 'func(a ...any) (n int, err error)', '{"external":true}');

-- === Parameters / locals (for DFG) ===

INSERT INTO nodes VALUES ('handler::ProcessData@handler.go:15:1::data', 'parameter', 'data', 'handler.go', 15, 20, 15, 'handler', 'handler::ProcessData@handler.go:15:1', '[]byte', '{"index":0}');
INSERT INTO nodes VALUES ('handler::ProcessData@handler.go:16:2::validated', 'local', 'validated', 'handler.go', 16, 2, 16, 'handler', 'handler::ProcessData@handler.go:15:1', 'bool', NULL);
INSERT INTO nodes VALUES ('handler::ProcessData@handler.go:17:2::result', 'local', 'result', 'handler.go', 17, 2, 17, 'handler', 'handler::ProcessData@handler.go:15:1', 'Result', NULL);
INSERT INTO nodes VALUES ('handler::ValidateInput@handler.go:60:1::input', 'parameter', 'input', 'handler.go', 60, 20, 60, 'handler', 'handler::ValidateInput@handler.go:60:1', 'string', '{"index":0}');
INSERT INTO nodes VALUES ('handler::Transform@handler.go:85:1::r', 'parameter', 'r', 'handler.go', 85, 16, 85, 'handler', 'handler::Transform@handler.go:85:1', 'Result', '{"index":0}');

-- === Call edges ===

INSERT INTO edges VALUES ('server::main@main.go:10:1', 'server::handleRequest@server.go:20:1', 'call', NULL);
INSERT INTO edges VALUES ('server::handleRequest@server.go:20:1', 'handler::ProcessData@handler.go:15:1', 'call', NULL);
INSERT INTO edges VALUES ('handler::ProcessData@handler.go:15:1', 'handler::ValidateInput@handler.go:60:1', 'call', NULL);
INSERT INTO edges VALUES ('handler::ProcessData@handler.go:15:1', 'handler::Transform@handler.go:85:1', 'call', NULL);
INSERT INTO edges VALUES ('handler::ProcessData@handler.go:15:1', 'db::Query@db.go:10:1', 'call', NULL);
INSERT INTO edges VALUES ('handler::Transform@handler.go:85:1', 'ext::fmt.Println', 'call', NULL);
INSERT INTO edges VALUES ('server::main@main.go:10:1', 'db::Connect@db.go:40:1', 'call', NULL);

-- === DFG edges (data flow) ===

INSERT INTO edges VALUES ('handler::ProcessData@handler.go:15:1::data', 'handler::ProcessData@handler.go:16:2::validated', 'dfg', NULL);
INSERT INTO edges VALUES ('handler::ProcessData@handler.go:16:2::validated', 'handler::ProcessData@handler.go:17:2::result', 'dfg', NULL);
INSERT INTO edges VALUES ('handler::ProcessData@handler.go:17:2::result', 'handler::Transform@handler.go:85:1::r', 'param_in', '{"index":0}');
INSERT INTO edges VALUES ('handler::ValidateInput@handler.go:60:1::input', 'handler::ProcessData@handler.go:16:2::validated', 'dfg', NULL);

-- === Package dependency graph ===

INSERT INTO dashboard_package_graph VALUES ('server', 'handler', 3);
INSERT INTO dashboard_package_graph VALUES ('handler', 'db', 1);
INSERT INTO dashboard_package_graph VALUES ('server', 'db', 1);

-- === Package treemap ===

INSERT INTO dashboard_package_treemap VALUES ('server', 2, 2, 150, 8, 4.0, 5, 0, 0);
INSERT INTO dashboard_package_treemap VALUES ('handler', 1, 3, 250, 15, 4.7, 8, 1, 0);
INSERT INTO dashboard_package_treemap VALUES ('db', 1, 2, 100, 5, 4.5, 6, 0, 0);

-- === Stats per package ===

INSERT INTO stats_packages VALUES ('server', 2, 2, 0, 150);
INSERT INTO stats_packages VALUES ('handler', 1, 3, 1, 250);
INSERT INTO stats_packages VALUES ('db', 1, 2, 0, 100);

-- === Metrics ===

INSERT INTO metrics VALUES ('server::main@main.go:10:1', 3, 0, 2, 20, 0);
INSERT INTO metrics VALUES ('server::handleRequest@server.go:20:1', 5, 1, 1, 30, 2);
INSERT INTO metrics VALUES ('handler::ProcessData@handler.go:15:1', 8, 1, 3, 30, 1);
INSERT INTO metrics VALUES ('handler::ValidateInput@handler.go:60:1', 4, 1, 0, 20, 1);
INSERT INTO metrics VALUES ('handler::Transform@handler.go:85:1', 2, 1, 1, 25, 1);
INSERT INTO metrics VALUES ('db::Query@db.go:10:1', 6, 1, 0, 25, 2);
INSERT INTO metrics VALUES ('db::Connect@db.go:40:1', 3, 1, 0, 15, 1);

-- === Function detail (pre-aggregated) ===

INSERT INTO dashboard_function_detail VALUES ('handler::ProcessData@handler.go:15:1', 'ProcessData', 'handler', 'handler.go', 15, 8, 30, 1, 3, 1, 'handleRequest', 'ValidateInput, Transform, Query');
INSERT INTO dashboard_function_detail VALUES ('server::handleRequest@server.go:20:1', 'handleRequest', 'server', 'server.go', 20, 5, 30, 1, 1, 2, 'main', 'ProcessData');
INSERT INTO dashboard_function_detail VALUES ('server::main@main.go:10:1', 'main', 'server', 'main.go', 10, 3, 20, 0, 2, 0, '', 'handleRequest, Connect');

-- === Sources ===

INSERT INTO sources VALUES ('main.go', 'package server

import (
	"fmt"
	"net/http"
)

// main starts the HTTP server.
func main() {
	db := Connect("sqlite://cpg.db")
	http.HandleFunc("/", handleRequest)
	fmt.Println("listening on :8080")
	http.ListenAndServe(":8080", nil)
}
', 'server');

INSERT INTO sources VALUES ('handler.go', 'package handler

import "context"

// Result holds processed data.
type Result struct {
	Value string
	Score int
}

// Output is the final transformed output.
type Output struct {
	Text string
}

// ProcessData validates, queries, and transforms input data.
func ProcessData(data []byte) (Result, error) {
	validated := ValidateInput(string(data))
	result, err := queryDB(context.Background(), validated)
	if err != nil {
		return Result{}, err
	}
	return result, nil
}

// ValidateInput checks the input string.
func ValidateInput(input string) error {
	if len(input) == 0 {
		return fmt.Errorf("empty input")
	}
	return nil
}

// Transform converts a Result into Output.
func Transform(r Result) Output {
	fmt.Println("transforming", r.Value)
	return Output{Text: r.Value}
}
', 'handler');

INSERT INTO sources VALUES ('db.go', 'package db

import "context"

// Rows is a result set.
type Rows struct{}

// DB wraps a database connection.
type DB struct{}

// Query executes a SQL query.
func Query(ctx context.Context, q string) (Rows, error) {
	return Rows{}, nil
}

// Connect opens a database connection.
func Connect(dsn string) (*DB, error) {
	return &DB{}, nil
}
', 'db');

-- === Symbol index ===

INSERT INTO symbol_index VALUES ('server::main@main.go:10:1', 'main', 'function', 'server', 'main.go', 10);
INSERT INTO symbol_index VALUES ('server::handleRequest@server.go:20:1', 'handleRequest', 'function', 'server', 'server.go', 20);
INSERT INTO symbol_index VALUES ('handler::ProcessData@handler.go:15:1', 'ProcessData', 'function', 'handler', 'handler.go', 15);
INSERT INTO symbol_index VALUES ('handler::ValidateInput@handler.go:60:1', 'ValidateInput', 'function', 'handler', 'handler.go', 60);
INSERT INTO symbol_index VALUES ('handler::Transform@handler.go:85:1', 'Transform', 'function', 'handler', 'handler.go', 85);
INSERT INTO symbol_index VALUES ('db::Query@db.go:10:1', 'Query', 'function', 'db', 'db.go', 10);
INSERT INTO symbol_index VALUES ('db::Connect@db.go:40:1', 'Connect', 'function', 'db', 'db.go', 40);
