#!/usr/bin/env node

// Standalone binary entrypoint for mtc CLI
// When compiled with bun build --compile, this file is the executable.
// When run via Node/Bun directly, it forwards to the TSX source.

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcEntry = resolve(__dirname, "..", "src", "cli.tsx");
const bunPath = process.execPath;

// In compiled binary, Bun handles the TSX directly.
// In dev mode, run via bun directly.
spawn(bunPath, ["run", srcEntry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env },
}).on("exit", (code) => process.exit(code ?? 1));
