#!/usr/bin/env bash
# 安裝依賴、建立 .env（若不存在）並以固定 Seed 建立 SQLite。
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .venv ] || uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt
(cd frontend && npm install)
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i.bak "s/^INTERNAL_SERVICE_TOKEN=.*/INTERNAL_SERVICE_TOKEN=$(openssl rand -hex 24)/" .env && rm -f .env.bak
  echo "已建立 .env；請填入 LLM_API_KEY。"
fi
./scripts/reset-demo.sh
