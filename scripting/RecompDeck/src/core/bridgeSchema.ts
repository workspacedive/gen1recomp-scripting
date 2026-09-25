// Validation of messages posted by the player page (untrusted input).
// Every message is { topic, data }; unknown topics and malformed payloads are
// rejected before they reach any handler.
// SPDX-License-Identifier: GPL-3.0-or-later

import { isSafeRelPath } from './paths'

export type BridgeMessage =
  | { topic: 'log'; data: { level: 'info' | 'warn' | 'error'; text: string } }
  | { topic: 'stage'; data: { stage: string } }
  | { topic: 'ready'; data: Record<string, unknown> }
  | { topic: 'error'; data: { message: string; traceback?: string; stage?: string } }
  | { topic: 'engineFault'; data: { message: string } }
  | { topic: 'quit'; data: { code?: number } }
  | { topic: 'quitToLauncher'; data: Record<string, never> }
  | { topic: 'haptic'; data: { style: 'light' | 'medium' | 'heavy' } }
  | { topic: 'openURL'; data: { url: string } }
  | { topic: 'persist.user'; data: { files: PersistFile[]; removes: string[]; dirs: string[] } }
  | { topic: 'persist.cache.begin'; data: { version: string; size: number; parts: number; sha256: string | null } }
  | { topic: 'persist.cache.part'; data: { version: string; index: number; b64: string } }
  | { topic: 'persist.cache.end'; data: { version: string; size: number; sha256: string | null } }
  | { topic: 'stats' | 'perf' | 'selftest' | 'diagnostics' | 'pong'; data: Record<string, unknown> }

export interface PersistFile { path: string; size: number; modtime?: number; b64: string }

const MAX_FILE = 64 * 1024 * 1024
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const VERSIONS = ['red', 'blue', 'yellow', 'gold', 'silver', 'crystal', 'firered', 'leafgreen']

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function str(v: unknown, max = 8192): string | null {
  return typeof v === 'string' && v.length <= max ? v : null
}

export function validateHttpsUrl(url: unknown): string | null {
  const u = str(url, 2048)
  if (!u || !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[^\s]*)?$/.test(u)) return null
  return u
}

export function parseBridgeMessage(raw: unknown): BridgeMessage | null {
  const m = obj(raw)
  if (!m) return null
  const topic = str(m.topic, 64)
  const d = obj(m.data) ?? {}
  if (!topic) return null
  switch (topic) {
    case 'log': {
      const level = d.level === 'warn' || d.level === 'error' ? d.level : 'info'
      return { topic, data: { level, text: String(d.text ?? '').slice(0, 4000) } }
    }
    case 'stage': return { topic, data: { stage: String(d.stage ?? '').slice(0, 64) } }
    case 'ready': return { topic, data: d }
    case 'error': return { topic, data: { message: String(d.message ?? 'error').slice(0, 8000), traceback: str(d.traceback, 20000) ?? undefined, stage: str(d.stage, 64) ?? undefined } }
    case 'engineFault': return { topic, data: { message: String(d.message ?? '').slice(0, 4000) } }
    case 'quit': return { topic, data: { code: typeof d.code === 'number' ? d.code : 0 } }
    case 'quitToLauncher': return { topic, data: {} }
    case 'haptic': {
      const style = d.style === 'light' || d.style === 'heavy' ? d.style : 'medium'
      return { topic, data: { style } }
    }
    case 'openURL': {
      const url = validateHttpsUrl(d.url)
      return url ? { topic, data: { url } } : null
    }
    case 'persist.user': {
      const files: PersistFile[] = []
      if (Array.isArray(d.files)) {
        for (const f of d.files.slice(0, 2000)) {
          const o = obj(f)
          if (!o || !isSafeRelPath(o.path) || typeof o.b64 !== 'string' || !B64_RE.test(o.b64)) return null
          const size = Number(o.size)
          if (!Number.isFinite(size) || size < 0 || size > MAX_FILE) return null
          files.push({ path: o.path, size, modtime: Number(o.modtime) || undefined, b64: o.b64 })
        }
      }
      const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 2000).filter(isSafeRelPath) : [])
      return { topic, data: { files, removes: list(d.removes), dirs: list(d.dirs) } }
    }
    case 'persist.cache.begin':
    case 'persist.cache.end': {
      const version = str(d.version, 16)
      const size = Number(d.size)
      if (!version || !VERSIONS.includes(version) || !Number.isFinite(size) || size < 12 || size > 1024 * 1024 * 1024) return null
      const sha = typeof d.sha256 === 'string' && /^[0-9a-f]{64}$/.test(d.sha256) ? d.sha256 : null
      if (topic === 'persist.cache.begin') {
        const parts = Number(d.parts)
        if (!Number.isInteger(parts) || parts < 1 || parts > 4096) return null
        return { topic, data: { version, size, parts, sha256: sha } }
      }
      return { topic, data: { version, size, sha256: sha } }
    }
    case 'persist.cache.part': {
      const version = str(d.version, 16)
      const index = Number(d.index)
      if (!version || !VERSIONS.includes(version) || !Number.isInteger(index) || index < 0 || index > 4096) return null
      if (typeof d.b64 !== 'string' || d.b64.length > 8 * 1024 * 1024 || !B64_RE.test(d.b64)) return null
      return { topic, data: { version, index, b64: d.b64 } }
    }
    case 'stats':
    case 'perf':
    case 'selftest':
    case 'diagnostics':
    case 'pong':
      return { topic, data: d }
    default:
      return null
  }
}
