#!/usr/bin/env node
// Fetches the Scripting app TypeScript declarations used by `npm run typecheck`.
// Source: the app-synced `dts/` folder committed in Honye/scripting-scripts,
// pinned to a commit and verified by SHA-256 (see AGENT.md §7 / SKILLS.md S1).
// Prefer the declarations synced by `npx scripting-cli start` from YOUR app
// version when available: copy its dts/global.d.ts and dts/scripting.d.ts into
// types/scripting/ instead.
// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const COMMIT = '41f3d2387c9a9dae4dfc9596b2fdd040cae55b11';
const FILES = {
  'global.d.ts': '5a474f741436cea513aad2a9dcac0f833ebaa0122073e7c59cc1d8cec99f787c',
  'scripting.d.ts': '92155306822de8d1b3c9c31acd604ab562f46c69f0fa70a4cdced63c4a7a5259',
};
const out = path.resolve('types/scripting');
fs.mkdirSync(out, { recursive: true });
async function get(name) {
  // 1) raw CDN, 2) GitHub contents API with the raw media type (works where
  // raw.githubusercontent.com is blocked); GITHUB_TOKEN is used if present.
  const urls = [
    [`https://raw.githubusercontent.com/Honye/scripting-scripts/${COMMIT}/dts/${name}`, {}],
    [`https://api.github.com/repos/Honye/scripting-scripts/contents/dts/${name}?ref=${COMMIT}`,
      { Accept: 'application/vnd.github.raw', ...(process.env.GITHUB_TOKEN || process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}` } : {}) }],
  ];
  let last;
  for (const [url, headers] of urls) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      last = new Error(`${url}: HTTP ${res.status}`);
    } catch (e) { last = e; }
  }
  throw last;
}
for (const [name, want] of Object.entries(FILES)) {
  const buf = await get(name);
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== want) throw new Error(`${name}: sha256 mismatch (${got})`);
  fs.writeFileSync(path.join(out, name), buf);
  console.log(`ok ${name} ${buf.length} bytes`);
}
