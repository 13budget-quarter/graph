# Installation & Launch Guide

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Go | 1.25+ | `go version` |
| Node.js | 20+ | `node -v` |
| npm | 10+ | `npm -v` |
| Git | any | `git --version` |

## Quick Start (one command)

```bash
git clone <repo-url> cpg-gen && cd cpg-gen
chmod +x start.sh
./start.sh
```

This will automatically:
1. Initialize git submodules (prometheus, client_golang, prometheus-adapter, alertmanager)
2. Build the `cpg-gen` binary
3. Generate the CPG database (~5 min, ~1 GB) — skipped if `cpg.db` already exists
4. Install npm dependencies and build the frontend
5. Start the web server on http://localhost:8080

## Step-by-Step (manual)

### 1. Clone and initialize

```bash
git clone <repo-url> cpg-gen
cd cpg-gen
git submodule update --init --recursive
```

### 2. Build the CPG generator

```bash
go build -o cpg-gen .
```

### 3. Generate the database

```bash
./cpg-gen -verbose ./prometheus cpg.db \
  -modules "./client_golang:github.com/prometheus/client_golang:client_golang,./prometheus-adapter:sigs.k8s.io/prometheus-adapter:adapter,./alertmanager:github.com/prometheus/alertmanager:alertmanager"
```

This takes 3–5 minutes and produces `cpg.db` (~1 GB).

### 4. Build the frontend

```bash
cd web/frontend
npm install
npm run build
cd ../..
```

### 5. Start the server

```bash
cd web
go run . -db ../cpg.db -port 8080
```

Open http://localhost:8080 in a browser.

### 6. Run tests

```bash
# Backend
cd web && go test ./... -race -count=1

# Frontend (requires server running)
cd web/frontend && npx playwright test
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `DB_PATH` | `./cpg.db` | Path to SQLite database |

## Docker

```bash
# Generate cpg.db first (steps 1–3), then:
docker compose up
```

## Project Structure

```
cpg-gen/
├── main.go                # CPG generator entry point
├── *.go                   # Analysis pipeline (AST, SSA, CFG, DFG, CDG, etc.)
├── go.mod
├── web/                   # Web explorer
│   ├── main.go            # Server entry point
│   ├── handlers.go        # HTTP API handlers
│   ├── queries.go         # SQLite queries
│   ├── models.go          # Data types
│   └── frontend/          # SvelteKit UI
│       ├── src/
│       └── package.json
├── prometheus/            # Git submodule
├── client_golang/         # Git submodule
├── prometheus-adapter/    # Git submodule
├── alertmanager/          # Git submodule
└── start.sh               # One-command setup & launch
```
