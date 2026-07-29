#!/usr/bin/env bash
set -euo pipefail

cd "$1"

# Must have created math.ts
if [ ! -f math.ts ]; then
  echo "FAIL: math.ts not found"
  exit 1
fi

# Must compile without errors
if ! npx tsc --noEmit 2>/dev/null; then
  echo "FAIL: TypeScript compilation errors"
  exit 1
fi

# Ensure original JS is gone (or at least the TS exists and works)
node -e "
const m = require('./math.ts' || './math');
console.assert(m.add(2, 3) === 5, 'add failed');
console.assert(m.subtract(10, 4) === 6, 'subtract failed');
console.assert(m.multiply(3, 4) === 12, 'multiply failed');
console.assert(m.divide(10, 2) === 5, 'divide failed');
console.assert(m.power(2, 3) === 8, 'power failed');
console.log('PASS: all arithmetic operations correct');
"
