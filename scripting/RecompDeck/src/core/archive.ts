// gzip framing + ustar parsing for npm tarballs.
//
// Scripting's Data.decompressed("zlib") uses Apple's Compression framework,
// whose "zlib" algorithm is raw DEFLATE (RFC 1951). A .tgz is gzip (RFC 1952)
// = header + raw DEFLATE + CRC32/ISIZE trailer, so the host strips the gzip
// header/trailer located here and inflates the rest natively.
// SPDX-License-Identifier: GPL-3.0-or-later

export interface GzipFrame {
  /** Offset of the raw DEFLATE stream. */
  deflateStart: number
  /** Exclusive end of the DEFLATE stream (trailer starts here). */
  deflateEnd: number
  /** Uncompressed size modulo 2^32 (from the trailer). */
  isize: number
  crc32: number
}

/** `head` = first bytes (>= 512 recommended), `trailer` = last 8 bytes. */
export function parseGzipFrame(head: Uint8Array, trailer: Uint8Array, totalSize: number): GzipFrame {
  if (head.length < 10 || head[0] !== 0x1f || head[1] !== 0x8b) throw new Error('not a gzip stream')
  if (head[2] !== 8) throw new Error('unsupported gzip compression method')
  const flg = head[3]
  if (flg & 0xe0) throw new Error('reserved gzip flags set')
  let p = 10
  const need = (n: number) => { if (p + n > head.length) throw new Error('gzip header exceeds probe window') }
  if (flg & 4) { need(2); const xlen = head[p] | (head[p + 1] << 8); p += 2; need(xlen); p += xlen }
  if (flg & 8) { while (true) { need(1); if (head[p++] === 0) break } }
  if (flg & 16) { while (true) { need(1); if (head[p++] === 0) break } }
  if (flg & 2) { need(2); p += 2 }
  if (trailer.length !== 8) throw new Error('gzip trailer must be 8 bytes')
  const dv = new DataView(trailer.buffer, trailer.byteOffset, 8)
  return { deflateStart: p, deflateEnd: totalSize - 8, crc32: dv.getUint32(0, true), isize: dv.getUint32(4, true) }
}

export interface TarEntry {
  name: string
  size: number
  type: string
  /** Offset of the file data inside the tar stream. */
  offset: number
}

function readString(b: Uint8Array, start: number, len: number): string {
  let s = ''
  for (let i = start; i < start + len; i++) {
    if (b[i] === 0) break
    s += String.fromCharCode(b[i])
  }
  return s
}

function readOctal(b: Uint8Array, start: number, len: number): number {
  const s = readString(b, start, len).trim()
  if (!s) return 0
  if (!/^[0-7]+$/.test(s)) throw new Error('bad octal field in tar header')
  return parseInt(s, 8)
}

function checksumOk(h: Uint8Array): boolean {
  const want = readOctal(h, 148, 8)
  let sum = 0
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i]
  return sum === want
}

/**
 * Walk a tar stream. `header(offset)` must return the 512 bytes at `offset`
 * (the host slices them from a native Data object, so file data is never
 * copied into JS). Stops at the end-of-archive marker.
 */
export function listTar(header: (offset: number) => Uint8Array, totalSize: number, maxEntries = 10000): TarEntry[] {
  const out: TarEntry[] = []
  let off = 0
  let longName: string | null = null
  while (off + 512 <= totalSize) {
    const h = header(off)
    if (h.every((x) => x === 0)) break
    if (!checksumOk(h)) throw new Error('tar header checksum mismatch at ' + off)
    const size = readOctal(h, 124, 12)
    const type = String.fromCharCode(h[156] || 48)
    const prefix = readString(h, 345, 155)
    let name = readString(h, 0, 100)
    if (prefix) name = prefix + '/' + name
    if (longName) { name = longName; longName = null }
    const dataOffset = off + 512
    if (type === 'L') {
      // GNU long name: the data block holds the name of the next entry
      longName = readString(header(dataOffset), 0, Math.min(size, 512))
    } else if (type !== 'x' && type !== 'g') {
      out.push({ name, size, type, offset: dataOffset })
      if (out.length > maxEntries) throw new Error('too many tar entries')
    }
    off = dataOffset + Math.ceil(size / 512) * 512
  }
  return out
}
