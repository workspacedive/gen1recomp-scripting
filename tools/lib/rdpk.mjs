// tools/lib/rdpk.mjs
// RDPK v1 pack format (Node implementation, byte-compatible with
// runtime/web/player.js and scripting/RecompDeck/src/storage/pack.ts).
//
//   "RDPK" u8 version=1 u8 flags=0 u16 reserved=0 u32 entryCount
//   entry: u16 pathLen, path (UTF-8), u8 type (0 file, 1 dir), u32 size,
//          f64 mtime (seconds), <size bytes>
// All integers little endian.
//
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';

export function buildPack(entries) {
  const enc = new TextEncoder();
  let total = 12;
  const paths = entries.map((e) => {
    const pb = enc.encode(e.path);
    if (pb.length > 0xffff) throw new Error(`path too long: ${e.path}`);
    total += 2 + pb.length + 1 + 4 + 8 + (e.data ? e.data.length : 0);
    return pb;
  });
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set([0x52, 0x44, 0x50, 0x4b, 1, 0, 0, 0]);
  dv.setUint32(8, entries.length, true);
  let p = 12;
  entries.forEach((e, i) => {
    const pb = paths[i];
    dv.setUint16(p, pb.length, true); p += 2;
    out.set(pb, p); p += pb.length;
    out[p] = e.type || 0; p += 1;
    const size = e.data ? e.data.length : 0;
    dv.setUint32(p, size, true); p += 4;
    dv.setFloat64(p, e.mtime || 0, true); p += 8;
    if (size) { out.set(e.data, p); p += size; }
  });
  return out;
}

export function parsePack(bytes) {
  const dec = new TextDecoder();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || dec.decode(bytes.subarray(0, 4)) !== 'RDPK') throw new Error('not an RDPK pack');
  if (bytes[4] !== 1) throw new Error(`unsupported RDPK version ${bytes[4]}`);
  const count = dv.getUint32(8, true);
  const entries = [];
  let p = 12;
  for (let i = 0; i < count; i++) {
    const plen = dv.getUint16(p, true); p += 2;
    const pth = dec.decode(bytes.subarray(p, p + plen)); p += plen;
    const type = bytes[p]; p += 1;
    const size = dv.getUint32(p, true); p += 4;
    const mtime = dv.getFloat64(p, true); p += 8;
    if (p + size > bytes.length) throw new Error(`truncated at ${pth}`);
    entries.push({ path: pth, type, size, mtime, data: bytes.subarray(p, p + size) });
    p += size;
  }
  if (p !== bytes.length) throw new Error(`trailing bytes after ${count} entries`);
  return entries;
}

// Pack a directory tree; paths are relative to `root`, prefixed by `prefix`.
export function packDirectory(root, prefix = '') {
  const entries = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const rel = prefix + path.relative(root, abs).split(path.sep).join('/');
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        entries.push({ path: rel, type: 1, mtime: st.mtimeMs / 1000 });
        walk(abs);
      } else if (st.isFile()) {
        entries.push({ path: rel, type: 0, mtime: st.mtimeMs / 1000, data: new Uint8Array(fs.readFileSync(abs)) });
      }
    }
  };
  walk(root);
  return entries;
}
