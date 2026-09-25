// In-memory ring buffer + per-day log file (Documents/RecompDeck/logs).
// Never log secrets or file contents; paths and messages only.
// SPDX-License-Identifier: GPL-3.0-or-later

import { DIRS } from './fs'

export type Level = 'info' | 'warn' | 'error'

const ring: string[] = []
const MAX = 600
let pending: string[] = []
let flushing = false

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function log(level: Level, message: string) {
  const line = `${stamp()} [${level}] ${String(message).slice(0, 2000)}`
  ring.push(line)
  if (ring.length > MAX) ring.splice(0, ring.length - MAX)
  if (level !== 'info') console.log(line)
  pending.push(line)
  void flushLog()
}

async function flushLog() {
  if (flushing || !pending.length) return
  flushing = true
  try {
    const lines = pending
    pending = []
    const file = `${DIRS.logs}/${new Date().toISOString().slice(0, 10)}.log`
    await FileManager.appendText(file, lines.join('\n') + '\n')
  } catch {
    /* logging must never throw */
  } finally {
    flushing = false
    if (pending.length) void flushLog()
  }
}

export function recentLogs(): string[] {
  return ring.slice()
}
