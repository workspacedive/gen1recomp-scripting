#!/usr/bin/env node
// Packages scripting/RecompDeck into dist/RecompDeck.scripting (a ZIP of the
// project directory, the format the Scripting app imports/exports).
// Reproducible: sorted entries, fixed DOS timestamp, no external deps.
//
//   node tools/package-scripting.mjs                 -> dist/RecompDeck.scripting
//   node tools/package-scripting.mjs --out release   -> release/RecompDeck.scripting
//   node tools/package-scripting.mjs --check release/RecompDeck.scripting
//        build in memory and fail (exit 1) if the committed file is stale
// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const projectDir = path.join(root, 'scripting', 'RecompDeck');
const argv = process.argv.slice(2);
const argOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(root, argOf('--out') ?? 'dist');
const checkFile = argOf('--check');
const outFile = path.join(outDir, 'RecompDeck.scripting');
const PREFIX = 'RecompDeck/';
const SKIP = /(^|\/)(\.DS_Store|Thumbs\.db|\.git.*|node_modules)(\/|$)/;

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function listFiles(dir, rel = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (SKIP.test(r)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listFiles(p, r));
    else out.push(r);
  }
  return out;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01

const locals = [];
const centrals = [];
let offset = 0;
const files = listFiles(projectDir);
if (!files.includes('script.json') || !files.includes('index.tsx')) {
  console.error('project must contain script.json and index.tsx');
  process.exit(1);
}
// Directory entries first-class (like `zip -r` and the official packages):
// "RecompDeck/", "RecompDeck/src/", ... sorted so parents precede children.
const dirs = new Set(['']);
for (const rel of files) {
  const parts = rel.split('/');
  for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/');
}
const entries = [...[...dirs].map((d) => ({ rel: d, dir: true })), ...files.map((f) => ({ rel: f, dir: false }))]
  .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
for (const { rel, dir } of entries) {
  const data = dir ? Buffer.alloc(0) : fs.readFileSync(path.join(projectDir, rel));
  const name = Buffer.from(PREFIX + rel, 'utf8');
  const deflated = dir ? data : zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = !dir && deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, body);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4); // made by: UNIX, 2.0
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  // external attributes: drwxr-xr-x + MS-DOS directory bit, or -rw-r--r--
  central.writeUInt32LE(dir ? (((0o40755 << 16) >>> 0) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, 38);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + body.length;
}
const cdSize = centrals.reduce((n, b) => n + b.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(entries.length, 8);
eocd.writeUInt16LE(entries.length, 10);
eocd.writeUInt32LE(cdSize, 12);
eocd.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...locals, ...centrals, eocd]);
const sha = crypto.createHash('sha256').update(zip).digest('hex');
if (checkFile) {
  const target = path.resolve(root, checkFile);
  const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (!current || !current.equals(zip)) {
    console.error(`${path.relative(root, target)} is stale or missing (fresh build: sha256 ${sha}); run: npm run release`);
    process.exit(1);
  }
  console.log(`${path.relative(root, target)} is up to date (${files.length} files, sha256 ${sha})`);
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, zip);
fs.writeFileSync(`${outFile}.sha256`, `${sha}  RecompDeck.scripting\n`);
console.log(`wrote ${path.relative(root, outFile)}: ${files.length} files, ${zip.length} bytes, sha256 ${sha}`);
