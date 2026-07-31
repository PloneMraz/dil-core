#!/usr/bin/env node
/**
 * `dil` — the executable entry (package.json `bin`). Deliberately tiny: it wires
 * process streams into `run` (cli-run.ts) and exits with the code it returns, so
 * all logic stays in a pure, unit-testable function. Importing this module would
 * run the CLI, so nothing imports it — tests exercise `run` directly.
 */

import process from "node:process";
import { run } from "./cli-run.js";

process.exit(run(process.argv.slice(2), process.stdout, process.stderr));
