#!/usr/bin/env bash
# 同時啟動 FastAPI（僅綁 127.0.0.1:8000）與 Next.js（127.0.0.1:3000）。
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
[ -f "${SQLITE_PATH:-./.local/telcocare.sqlite3}" ] || ./scripts/reset-demo.sh
.venv/bin/uvicorn backend.main:app_factory --factory --host 127.0.0.1 --port 8000 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
cd frontend
# Next.js 讀取 repo 根目錄 .env 的值（已由 set -a 匯出）
npm run dev
