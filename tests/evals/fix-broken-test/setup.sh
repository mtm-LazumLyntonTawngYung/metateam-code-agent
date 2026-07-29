#!/usr/bin/env bash
set -euo pipefail

cd "$1"

cat > string_utils.js << 'EOF'
/**
 * Capitalize the first letter of each word in a string.
 * Words are separated by spaces.
 */
function capitalize(str) {
  if (typeof str !== "string" || str.length === 0) return "";
  const words = str.split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length > 0) {
      words[i] = w[0].toUpperCase() + w.slice(2);  // BUG: should be slice(1)
    }
  }
  return words.join(" ");
}

module.exports = { capitalize };
EOF

cat > test.js << 'EOF'
const { capitalize } = require("./string_utils");

const tests = [
  { input: "hello", expected: "Hello" },
  { input: "hello world", expected: "Hello World" },
  { input: "the quick brown fox", expected: "The Quick Brown Fox" },
  { input: "", expected: "" },
  { input: "a", expected: "A" },
];

let passed = 0;
let failed = 0;

for (const { input, expected } of tests) {
  const result = capitalize(input);
  if (result === expected) {
    console.log(`  PASS: "${input}" -> "${result}"`);
    passed++;
  } else {
    console.log(`  FAIL: "${input}" -> "${result}" (expected "${expected}")`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
EOF
