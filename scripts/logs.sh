#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE_PATH="${1:-../log-output/observer.log}"
TARGET="${SCRIPT_DIR}/${FILE_PATH}"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_FILE="${OUTPUT_FILE:-${REPO_ROOT}/project-logs.log}"

if [ ! -f "${TARGET}" ]; then
  echo "Log file not found yet at ${TARGET}. Waiting for logger to create it..."
  while [ ! -f "${TARGET}" ]; do
    sleep 1
  done
fi

echo "Tailing ${TARGET}"
echo "Writing copy to ${OUTPUT_FILE}"
mkdir -p "$(dirname "${OUTPUT_FILE}")"
tail -n 200 -F "${TARGET}" | tee -a "${OUTPUT_FILE}"
