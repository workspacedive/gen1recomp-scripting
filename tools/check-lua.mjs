#!/usr/bin/env node
// Syntax-checks every Lua file of the runtime with PUC Lua 5.1 (the VM of
// love.js). Requires `luac5.1` (or LUAC env var) on PATH.
// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const luac = process.env.LUAC || 'luac5.1';
const roots = ['scripting/RecompDeck/runtime', 'tests/lua'];
const files = [];
const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(lua|card)$/.test(n)) files.push(p); } };
roots.forEach((r) => fs.existsSync(r) && walk(r));
let bad = 0;
for (const f of files) {
  try { execFileSync(luac, ['-p', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error(String(e.stderr || e.message).trim()); }
  const src = fs.readFileSync(f, 'utf8');
  if (/\bgoto\b|::[A-Za-z_]+::/.test(src.replace(/--[^\n]*/g, ''))) { bad++; console.error(`${f}: goto/labels are not Lua 5.1`); }
}
console.log(`${files.length} Lua files checked, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
