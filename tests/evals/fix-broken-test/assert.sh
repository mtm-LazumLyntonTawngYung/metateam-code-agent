#!/usr/bin/env bash
set -euo pipefail

cd "$1"

if ! node test.js 2>&1; then
  echo "FAIL: tests did not pass"
  exit 1
fi

echo "PASS: all tests passing"
exit 0
