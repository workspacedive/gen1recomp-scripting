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
