#!/usr/bin/env bash
set -euo pipefail

cd "$1"

if [ ! -f test.js ]; then
  echo "FAIL: test.js not found"
  exit 1
fi

if ! node test.js 2>&1; then
  echo "FAIL: tests did not pass"
  exit 1
fi

echo "PASS: all unit tests passing"
exit 0
