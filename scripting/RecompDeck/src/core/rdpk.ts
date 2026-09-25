// RDPK v1 pack format — byte-compatible with runtime/web/player.js and
// tools/lib/rdpk.mjs.
//
//   "RDPK" u8 version=1 u8 flags=0 u16 reserved=0 u32 entryCount
//   entry: u16 pathLen, path (UTF-8), u8 type (0 file, 1 dir), u32 size,
//          f64 mtime (seconds), <size bytes>
// All integers little endian.
//
// The host builds large packs from native Data objects: this module produces
// the small header byte arrays; file contents are appended natively.
// SPDX-License-Identifier: GPL-3.0-or-later

export const RDPK_MAGIC = [0x52, 0x44, 0x50, 0x4b]

export interface PackEntry {
  path: string
  type: 0 | 1
  mtime?: number
  data?: Uint8Array
}

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++ }
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

export function utf8Decode(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length;) {
    const c = b[i++]
    if (c < 0x80) s += String.fromCharCode(c)
    else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63))
    else if (c < 0xf0) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63))
    else {
      const cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)
      const v = cp - 0x10000
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023))
    }
  }
  return s
}

export function packHeader(count: number): Uint8Array {
  const out = new Uint8Array(12)
  out.set(RDPK_MAGIC, 0)
  out[4] = 1
  new DataView(out.buffer).setUint32(8, count >>> 0, true)
  return out
}

/** Header of one entry (without its data). */
export function entryHeader(path: string, type: 0 | 1, size: number, mtime = 0): Uint8Array {
  const pb = utf8Encode(path)
  if (pb.length > 0xffff) throw new Error('path too long: ' + path)
  if (size < 0 || size > 0xffffffff) throw new Error('entry too large: ' + path)
  const out = new Uint8Array(2 + pb.length + 1 + 4 + 8)
  const dv = new DataView(out.buffer)
  dv.setUint16(0, pb.length, true)
  out.set(pb, 2)
  let p = 2 + pb.length
  out[p] = type
  p += 1
  dv.setUint32(p, size >>> 0, true)
  p += 4
  dv.setFloat64(p, mtime || 0, true)
  return out
}

export function buildPack(entries: PackEntry[]): Uint8Array {
  const parts: Uint8Array[] = [packHeader(entries.length)]
  for (const e of entries) {
    const size = e.type === 0 && e.data ? e.data.length : 0
    parts.push(entryHeader(e.path, e.type, size, e.mtime))
    if (size && e.data) parts.push(e.data)
  }
  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

export interface ParsedEntry { path: string; type: number; size: number; mtime: number; offset: number }

export function parsePack(bytes: Uint8Array): ParsedEntry[] {
  if (bytes.length < 12 || RDPK_MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('not an RDPK pack')
  if (bytes[4] !== 1) throw new Error('unsupported RDPK version ' + bytes[4])
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = dv.getUint32(8, true)
  const out: ParsedEntry[] = []
  let p = 12
  for (let i = 0; i < count; i++) {
    if (p + 2 > bytes.length) throw new Error('truncated pack')
    const plen = dv.getUint16(p, true); p += 2
    const path = utf8Decode(bytes.subarray(p, p + plen)); p += plen
    const type = bytes[p]; p += 1
    const size = dv.getUint32(p, true); p += 4
    const mtime = dv.getFloat64(p, true); p += 8
    if (p + size > bytes.length) throw new Error('truncated at ' + path)
    out.push({ path, type, size, mtime, offset: p })
    p += size
  }
  if (p !== bytes.length) throw new Error('trailing bytes in pack')
  return out
}
