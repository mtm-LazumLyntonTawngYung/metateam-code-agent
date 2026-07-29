const { spawnSync } = require("child_process");
const sandboxDir = process.argv[2];
if (!sandboxDir) { console.error("Usage: assert.js <sandboxDir>"); process.exit(1); }

const result = spawnSync("node", ["test.js"], {
  cwd: sandboxDir,
  stdio: "pipe",
  encoding: "utf-8",
});

console.log(result.stdout);
if (result.status !== 0) console.error(result.stderr);
process.exit(result.status ?? 1);
