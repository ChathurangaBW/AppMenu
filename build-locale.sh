#!/bin/bash
# build-locale.sh - extract translatable strings and compile message catalogs
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$ROOT_DIR/build-locale.py" "$@"
