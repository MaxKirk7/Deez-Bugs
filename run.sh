#!/usr/bin/env bash
# Start Penny.
#
#   ./run.sh            backend + frontend, opens the browser   (Ctrl+C stops both)
#   ./run.sh backend    backend only   → http://localhost:8000  (API docs at /docs)
#   ./run.sh frontend   frontend only  → http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")"

# Anaconda ships an old Node that can't build the frontend: prefer Homebrew's if installed.
[ -x /opt/homebrew/bin/node ] && export PATH="/opt/homebrew/bin:$PATH"

fail() { echo "❌ $1"; exit 1; }
port_free() {
  local who
  # lsof exits 1 when the port is free, so don't let that stop the script
  who=$( (lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true) | awk 'NR==2 {print $1" (pid "$2")"}')
  local pid=${who##*pid }
  [ -z "$who" ] || fail "Port $1 is already in use by $who. Stop it first: Ctrl+C in its terminal, or run: kill ${pid%)}"
}

backend_checks() {
  command -v uv >/dev/null || fail "uv not found. Install it: brew install uv"
  [ -f .env ] || fail "No .env file. Run: cp .env.example .env   then paste the real DATABASE_URL into it"
  port_free 8000
  echo "→ Installing Python packages (uv sync)..."
  uv sync -q
}

frontend_checks() {
  command -v node >/dev/null || fail "Node.js not found. Install it: brew install node"
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)' \
    || fail "Node $(node --version) is too old (need 20.19+ or 22.12+). Run: brew install node   then open a new terminal"
  port_free 5173
  echo "→ Installing frontend packages (npm install)..."
  (cd frontend && npm install --silent --no-audit --no-fund)
}

case "${1:-all}" in
  backend)
    backend_checks
    exec uv run runserver
    ;;
  frontend)
    frontend_checks
    cd frontend && exec npm run dev -- --port 5173 --strictPort
    ;;
  all)
    backend_checks
    frontend_checks
    # Ctrl+C (or either server dying) stops everything started by this script.
    trap 'trap - INT TERM EXIT; echo; echo "Stopping..."; kill 0 2>/dev/null' INT TERM EXIT
    uv run runserver &
    (cd frontend && npm run dev -- --port 5173 --strictPort) &
    # Open the browser once the frontend is up.
    for _ in $(seq 1 60); do
      if curl -s -o /dev/null http://localhost:5173/; then
        echo
        echo "✅ Penny is running: http://localhost:5173   (backend: http://localhost:8000/docs)   Ctrl+C to stop"
        command -v open >/dev/null && open http://localhost:5173
        break
      fi
      sleep 1
    done
    wait -n 2>/dev/null || wait
    ;;
  *)
    fail "Unknown option '$1'. Use: ./run.sh   ./run.sh backend   ./run.sh frontend"
    ;;
esac
