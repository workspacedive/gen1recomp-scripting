// Path validation and classification of save-directory paths.
// Everything coming from the page/game is untrusted: a path must be relative,
// forward-slash separated, without "..", NUL, backslashes or overlong parts.
// SPDX-License-Identifier: GPL-3.0-or-later

import { BRIDGE_MOD_ID } from './constants'

const MAX_PATH = 512
const MAX_SEGMENT = 128

export function isSafeRelPath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0 || p.length > MAX_PATH) return false
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false
  const parts = p.split('/')
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..' || part.length > MAX_SEGMENT) return false
    // control characters are never legitimate in game paths
    if (/[\u0000-\u001f\u007f]/.test(part)) return false
  }
  return true
}

const VERSIONS = 'red|blue|yellow|gold|silver|crystal|firered|leafgreen'
const CACHE_RE = new RegExp(`^(${VERSIONS})/(data/generated/|assets/generated/|rom-cache\\.complete$)`)

export type PathClass =
  | { kind: 'cache'; game: string }
  | { kind: 'hostMod'; modId: string }
  | { kind: 'runtime' }
  | { kind: 'user' }

/** Decide who owns a save-directory path. */
export function classifySavePath(p: string): PathClass {
  if (p === '.rd' || p.startsWith('.rd/')) return { kind: 'runtime' }
  const m = CACHE_RE.exec(p)
  if (m) return { kind: 'cache', game: m[1] }
  const mm = /^mods\/([A-Za-z0-9_-]+)(\/|$)/.exec(p)
  if (mm && mm[1] === BRIDGE_MOD_ID) return { kind: 'hostMod', modId: mm[1] }
  return { kind: 'user' }
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((x) => x !== '')
    .join('/')
    .replace(/\/{2,}/g, '/')
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? (i === 0 ? '/' : '') : p.slice(0, i)
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}

/** Sanitise a user supplied file name for storage (keeps the extension). */
export function safeFileName(name: string, fallback = 'file'): string {
  const base = basename(String(name || '')).replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 96)
  return base || fallback
}

/**
 * WebView navigation guard: true only for a `file://` URL whose decoded path is
 * `dir` itself or lies strictly inside it. Fail-closed on anything unusual:
 * non-empty authority (`file://host/…`), dot segments (`.`/`..`, also when
 * percent-encoded), empty segments, encoded slashes/backslashes, NUL/control
 * characters and malformed percent-encoding. Query and fragment are ignored.
 */
export function isFileUrlInside(url: string, dir: string): boolean {
  if (typeof url !== 'string' || !url.startsWith('file:///')) return false
  if (!dir.startsWith('/') || dir.endsWith('/')) return false
  const rawPath = url.slice(7).split(/[?#]/, 1)[0]
  if (/%(2f|5c|00)/i.test(rawPath)) return false
  let path: string
  try { path = decodeURIComponent(rawPath) } catch { return false }
  if (/[\u0000-\u001f\\]/.test(path)) return false
  const segs = path.split('/').slice(1)
  if (segs.some((s, i) => s === '.' || s === '..' || (s === '' && i < segs.length - 1))) return false
  return path === dir || path.startsWith(dir + '/')
}
