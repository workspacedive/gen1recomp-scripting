// Blob publishing for the WebView.
//
// WKWebView pages loaded from file:// may load <script src> files inside the
// read-access directory but not fetch()/XHR them. Every binary the player
// needs is therefore published as a series of small JS files
//   RD.chunk("<id>", <index>, "<base64>");
// (3 MiB raw per chunk; a multiple of 3 so only the last chunk has padding).
// Chunks are content-addressed by SHA-256 and reused across sessions; base64
// encoding and slicing are native (Data), never per-byte JS loops.
// SPDX-License-Identifier: GPL-3.0-or-later

import { entryHeader, packHeader } from '../core/rdpk'
import { DIRS, ensureDir, exists, listTree, removeIfExists } from '../platform/fs'
import { sha256Hex } from '../platform/hash'

export const CHUNK_SIZE = 3 * 1024 * 1024

export interface BlobDesc {
  id: string
  chunks: string[]
  chunkSize: number
  size: number
  sha256: string
}

export async function publishBlob(data: Data, knownSha256?: string): Promise<BlobDesc> {
  const sha = (knownSha256 ?? sha256Hex(data)).toLowerCase()
  const id = 'b' + sha.slice(0, 20)
  const dir = `${DIRS.player}/blobs/${sha}`
  const count = Math.max(1, Math.ceil(data.size / CHUNK_SIZE))
  const chunks = Array.from({ length: count }, (_, i) => `blobs/${sha}/${i}.js`)
  const marker = `${dir}/complete.json`
  if (!(await exists(marker))) {
    await removeIfExists(dir)
    await ensureDir(dir)
    for (let i = 0; i < count; i++) {
      const part = data.slice(i * CHUNK_SIZE, Math.min(data.size, (i + 1) * CHUNK_SIZE))
      await FileManager.writeAsString(`${dir}/${i}.js`, `RD.chunk("${id}",${i},"${part.toBase64String()}");\n`)
    }
    await FileManager.writeAsString(marker, JSON.stringify({ size: data.size, count }))
  }
  return { id, chunks, chunkSize: CHUNK_SIZE, size: data.size, sha256: sha }
}

export async function publishFile(path: string, knownSha256?: string): Promise<BlobDesc> {
  return publishBlob(await FileManager.readAsData(path), knownSha256)
}

/** Remove cached blobs not used by the current session. */
export async function pruneBlobs(keep: Set<string>) {
  const root = `${DIRS.player}/blobs`
  if (!(await exists(root))) return
  for (const name of await FileManager.readDirectory(root)) {
    if (!keep.has(name)) await removeIfExists(`${root}/${name}`)
  }
}

// ------------------------------------------------------------------ packs
export interface PackSource {
  path: string
  type: 0 | 1
  absPath?: string
  data?: Data
}

function bytes(u8: Uint8Array): Data {
  const d = Data.fromUint8Array(u8)
  if (!d) throw new Error('Data.fromUint8Array failed')
  return d
}

/** Build an RDPK pack natively: headers from JS, contents appended as Data. */
export async function buildPackData(entries: PackSource[]): Promise<Data> {
  const parts: Data[] = [bytes(packHeader(entries.length))]
  for (const e of entries) {
    let content: Data | null = null
    if (e.type === 0) content = e.data ?? (e.absPath ? await FileManager.readAsData(e.absPath) : null)
    parts.push(bytes(entryHeader(e.path, e.type, content ? content.size : 0, 0)))
    if (content && content.size) parts.push(content)
  }
  return Data.combine(parts)
}

/** Pack sources for a directory tree (paths prefixed by `prefix`). */
export async function directorySources(absDir: string, prefix: string, filter?: (rel: string) => boolean): Promise<PackSource[]> {
  const out: PackSource[] = []
  for (const rel of await listTree(absDir, true)) {
    const isDir = rel.endsWith('/')
    const clean = isDir ? rel.slice(0, -1) : rel
    if (filter && !filter(clean)) continue
    out.push(isDir ? { path: prefix + clean, type: 1 } : { path: prefix + clean, type: 0, absPath: `${absDir}/${clean}` })
  }
  return out
}
