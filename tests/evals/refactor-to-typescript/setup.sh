#!/usr/bin/env bash
set -euo pipefail

cd "$1"

cat > math.js << 'EOF'
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return a / b;
}

function power(base, exp) {
  return Math.pow(base, exp);
}

module.exports = { add, subtract, multiply, divide, power };
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "ESNext",
    "module": "commonjs"
  }
}
EOF
