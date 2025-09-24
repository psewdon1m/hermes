#!/usr/bin/env bash
set -euo pipefail

FILE_PATH="${1:-../log-output/observer.log}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${SCRIPT_DIR}/${FILE_PATH}"

if [ ! -f "${TARGET}" ]; then
  echo "Log file not found yet at ${TARGET}. Waiting for logger to create it..."
  while [ ! -f "${TARGET}" ]; do
    sleep 1
  done
fi

echo "Tailing ${TARGET}"
tail -n 200 -F "${TARGET}"
