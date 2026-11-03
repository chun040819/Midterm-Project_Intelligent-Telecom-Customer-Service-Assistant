#!/usr/bin/env bash
# 還原六張表與固定 Seed。記憶體中的 Session／Quote／data_ref 需重啟 dev 才會清除。
# 此指令亦重建索引，會將政策文件傳送至設定的 embedding 服務。
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
.venv/bin/python -m backend.db.seed
.venv/bin/python -m backend.rag.build_index
