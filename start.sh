#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8080}"
DB="${DB_PATH:-$ROOT/cpg.db}"

# ── 1. Git submodules ──────────────────────────────────
echo "[1/5] submodules..."
cd "$ROOT"
git submodule update --init --recursive

# ── 2. Build cpg-gen ───────────────────────────────────
echo "[2/5] building cpg-gen..."
go build -o "$ROOT/cpg-gen" .

# ── 3. Generate CPG database (skip if exists) ──────────
if [[ ! -f "$DB" ]]; then
    echo "[3/5] generating CPG database (this takes a few minutes)..."
    "$ROOT/cpg-gen" -verbose ./prometheus "$DB" \
        -modules "./client_golang:github.com/prometheus/client_golang:client_golang,./prometheus-adapter:sigs.k8s.io/prometheus-adapter:adapter,./alertmanager:github.com/prometheus/alertmanager:alertmanager"
else
    echo "[3/5] CPG database already exists, skipping generation"
fi

# ── 4. Build frontend ─────────────────────────────────
echo "[4/5] frontend..."
cd "$ROOT/web/frontend"
npm install
npm run build

# ── 5. Start server ───────────────────────────────────
echo "[5/5] starting server on :$PORT ..."
lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

cd "$ROOT/web"
mkdir -p "$ROOT/.run"
nohup go run . -db "$DB" -port "$PORT" >"$ROOT/.run/server.log" 2>&1 &
PID=$!
echo "$PID" > "$ROOT/.run/server.pid"

sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
    echo "error: server failed to start"
    tail -20 "$ROOT/.run/server.log"
    exit 1
fi

echo ""
echo "✅ http://localhost:$PORT"
echo "   pid: $PID | log: .run/server.log"
