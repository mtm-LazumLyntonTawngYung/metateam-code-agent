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
