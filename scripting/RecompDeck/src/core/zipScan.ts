// ZIP central-directory scanner and extraction policy.
//
// Runs BEFORE any archive is extracted with FileManager.unzip: it reads only
// the End Of Central Directory record and the central directory (the host
// passes the file tail), so it costs a few KB regardless of archive size.
// Rejects: path traversal ("..", absolute, backslashes, drive letters),
// symlinks, encrypted entries, unsupported methods, too many entries, zip
// bombs (declared size / ratio limits), duplicate names and ZIP64 archives
// larger than the policy allows.
// SPDX-License-Identifier: GPL-3.0-or-later

import { utf8Decode } from './rdpk'

export interface ZipEntry {
  name: string
  compressedSize: number
  uncompressedSize: number
  method: number
  isDirectory: boolean
  isSymlink: boolean
  encrypted: boolean
  crc32: number
}

export interface ZipPolicy {
  maxEntries: number
  maxTotalUncompressed: number
  maxEntryUncompressed: number
  maxRatio: number
  allowedMethods: number[]
}

export const DEFAULT_ZIP_POLICY: ZipPolicy = {
  maxEntries: 4096,
  maxTotalUncompressed: 256 * 1024 * 1024,
  maxEntryUncompressed: 128 * 1024 * 1024,
  maxRatio: 200,
  allowedMethods: [0, 8],
}

export interface ZipScanResult {
  entries: ZipEntry[]
  totalUncompressed: number
  problems: string[]
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

/**
 * Locate the EOCD in `tail` (the last bytes of the file).
 * Returns the central directory offset/size relative to the whole file.
 */
export function findEocd(tail: Uint8Array, fileSize: number): { cdOffset: number; cdSize: number; count: number } {
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  for (let i = tail.length - 22; i >= 0 && i >= tail.length - 22 - 0xffff; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      const count = dv.getUint16(i + 10, true)
      const cdSize = dv.getUint32(i + 12, true)
      const cdOffset = dv.getUint32(i + 16, true)
      if (cdOffset === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
        throw new Error('ZIP64 archives are not supported')
      }
      if (cdOffset + cdSize > fileSize) throw new Error('corrupt ZIP: central directory out of range')
      return { cdOffset, cdSize, count }
    }
  }
  throw new Error('not a ZIP archive (no end of central directory)')
}

export function parseCentralDirectory(cd: Uint8Array, expectedCount: number): ZipEntry[] {
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const out: ZipEntry[] = []
  let p = 0
  while (p + 46 <= cd.length) {
    if (dv.getUint32(p, true) !== CEN_SIG) throw new Error('corrupt ZIP: bad central directory header')
    const versionMadeBy = dv.getUint16(p + 4, true)
    const flags = dv.getUint16(p + 8, true)
    const method = dv.getUint16(p + 10, true)
    const crc32 = dv.getUint32(p + 16, true)
    const compressedSize = dv.getUint32(p + 20, true)
    const uncompressedSize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const externalAttr = dv.getUint32(p + 38, true)
    const nameBytes = cd.subarray(p + 46, p + 46 + nameLen)
    const name = utf8Decode(nameBytes)
    const hostOS = versionMadeBy >> 8
    const unixMode = hostOS === 3 ? (externalAttr >>> 16) : 0
    out.push({
      name,
      compressedSize,
      uncompressedSize,
      method,
      isDirectory: name.endsWith('/'),
      isSymlink: (unixMode & 0o170000) === 0o120000,
      encrypted: (flags & 1) !== 0,
      crc32,
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  if (out.length !== expectedCount) throw new Error(`corrupt ZIP: expected ${expectedCount} entries, found ${out.length}`)
  return out
}

export function isSafeZipPath(name: string): boolean {
  if (!name || name.length > 512) return false
  if (name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name) || name.includes('\0')) return false
  const parts = name.replace(/\/$/, '').split('/')
  return parts.every((s) => s !== '' && s !== '.' && s !== '..' && !/[\u0000-\u001f]/.test(s))
}

export function checkEntries(entries: ZipEntry[], policy: ZipPolicy = DEFAULT_ZIP_POLICY): ZipScanResult {
  const problems: string[] = []
  if (entries.length > policy.maxEntries) problems.push(`too many entries (${entries.length} > ${policy.maxEntries})`)
  let total = 0
  const seen = new Set<string>()
  for (const e of entries) {
    if (!isSafeZipPath(e.name)) problems.push(`unsafe path: ${e.name}`)
    const key = e.name.toLowerCase()
    if (seen.has(key)) problems.push(`duplicate entry: ${e.name}`)
    seen.add(key)
    if (e.isSymlink) problems.push(`symbolic link not allowed: ${e.name}`)
    if (e.encrypted) problems.push(`encrypted entry not allowed: ${e.name}`)
    if (!e.isDirectory && !policy.allowedMethods.includes(e.method)) problems.push(`unsupported compression method ${e.method}: ${e.name}`)
    if (e.uncompressedSize > policy.maxEntryUncompressed) problems.push(`entry too large: ${e.name}`)
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > policy.maxRatio && e.uncompressedSize > 1024 * 1024) {
      problems.push(`suspicious compression ratio: ${e.name}`)
    }
    total += e.uncompressedSize
  }
  if (total > policy.maxTotalUncompressed) problems.push(`archive expands to ${total} bytes (limit ${policy.maxTotalUncompressed})`)
  return { entries, totalUncompressed: total, problems }
}

/** Common single top-level folder of all entries ("" if none). */
export function commonRoot(entries: ZipEntry[]): string {
  let root: string | null = null
  for (const e of entries) {
    const first = e.name.split('/')[0]
    const isDirOnly = !e.name.includes('/') && !e.isDirectory
    if (isDirOnly) return ''
    if (root === null) root = first
    else if (root !== first) return ''
  }
  return root ? root + '/' : ''
}
