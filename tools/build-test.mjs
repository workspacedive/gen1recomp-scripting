#!/usr/bin/env node
// Compiles the pure host modules (src/core) to CommonJS for the Node unit tests.
// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const out = '.cache/test-build';
fs.rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.test.json'], { stdio: 'inherit' });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }));
