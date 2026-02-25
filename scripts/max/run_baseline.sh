#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAX_BIN="${MAX_BIN:-$REPO_ROOT/.venv/bin/max}"
if [ ! -x "$MAX_BIN" ]; then
  if command -v max >/dev/null 2>&1; then
    MAX_BIN="$(command -v max)"
  else
    echo "max CLI not found. Install modular in .venv or set MAX_BIN."
    exit 1
  fi
fi

if [ $# -lt 2 ]; then
  echo "Usage: $0 <model_path> <out_json>"
  exit 1
fi

MODEL_PATH="$1"
OUT_JSON="$2"

"$MAX_BIN" warm-cache --model-path "$MODEL_PATH"

"$MAX_BIN" benchmark \
  --model "$MODEL_PATH" \
  --dataset-name sharegpt \
  --num-prompts 200 \
  --output-file "$OUT_JSON"

echo "Baseline benchmark written to $OUT_JSON"
