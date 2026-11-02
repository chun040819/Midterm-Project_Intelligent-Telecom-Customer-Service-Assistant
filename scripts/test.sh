#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/python -m pytest backend -q
(cd frontend && npm run typecheck && npm test)
