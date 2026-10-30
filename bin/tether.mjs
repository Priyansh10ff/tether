#!/usr/bin/env node
// Runs the TypeScript CLI through tsx so no build step is needed for local use.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, "..", "node_modules", "tsx", "dist", "cli.mjs"), join(here, "..", "src", "cli", "index.ts"), ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
