#!/usr/bin/env node

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcEntry = resolve(__dirname, "..", "src", "cli.tsx");

spawn("bun", ["run", srcEntry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
}).on("exit", (code) => process.exit(code ?? 1));
