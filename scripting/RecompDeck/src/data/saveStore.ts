// Mirror of the game's save directory (user data only: saves, options,
// prints, mod storage …). Receives changes from the player, feeds the next
// session, and provides backups / export / import.
// SPDX-License-Identifier: GPL-3.0-or-later

import { classifySavePath, isSafeRelPath } from '../core/paths'
import type { PersistFile } from '../core/bridgeSchema'
import { parseLuaReturn } from '../core/luaTable'
import { findSlots, SlotRef, SlotSummary, summarizeSave } from '../core/slots'
import type { GameId } from '../core/constants'
import { checkEntries, findEocd, parseCentralDirectory } from '../core/zipScan'
import { DIRS, ensureDir, exists, listTree, removeIfExists, writeDataAtomic } from '../platform/fs'
import { log } from '../platform/log'

let writeQueue: Promise<void> = Promise.resolve()

/** Apply a persist.user batch; writes are serialised and atomic. */
export function applyUserBatch(batch: { files: PersistFile[]; removes: string[]; dirs: string[] }): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    for (const d of batch.dirs) {
      if (isSafeRelPath(d) && classifySavePath(d).kind === 'user') await ensureDir(`${DIRS.save}/${d}`)
    }
    for (const f of batch.files) {
      if (!isSafeRelPath(f.path) || classifySavePath(f.path).kind !== 'user') continue
      const data = Data.fromBase64String(f.b64)
      if (!data || data.size !== f.size) { log('warn', `persist: size mismatch for ${f.path}`); continue }
      await writeDataAtomic(`${DIRS.save}/${f.path}`, data)
    }
    for (const r of batch.removes) {
      if (isSafeRelPath(r) && classifySavePath(r).kind === 'user') await removeIfExists(`${DIRS.save}/${r}`)
    }
  }).catch((e) => log('error', 'persist write failed: ' + String(e)))
  return writeQueue
}

export function pendingWrites(): Promise<void> {
  return writeQueue
}

export async function userFiles(): Promise<string[]> {
  return (await listTree(DIRS.save)).filter((p) => isSafeRelPath(p) && classifySavePath(p).kind === 'user')
}

export interface SlotInfo extends SlotRef { summary: SlotSummary | null; modified: number }

export async function slotsFor(game: GameId): Promise<SlotInfo[]> {
  const files = await userFiles()
  const out: SlotInfo[] = []
  for (const ref of findSlots(game, files)) {
    let summary: SlotSummary | null = null
    let modified = 0
    try {
      const abs = `${DIRS.save}/${ref.path}`
      modified = (await FileManager.stat(abs)).modificationDate
      summary = summarizeSave(parseLuaReturn(await FileManager.readAsString(abs)))
    } catch (e) {
      log('warn', `slot ${ref.path} unreadable: ${String(e)}`)
    }
    out.push({ ...ref, summary, modified })
  }
  return out
}

// ------------------------------------------------------------------ backups
function stampName() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export async function backupNow(reason: string, keep: number): Promise<string | null> {
  if (!(await exists(DIRS.save)) || !(await userFiles()).length) return null
  await ensureDir(DIRS.backups)
  const dest = `${DIRS.backups}/saves-${stampName()}-${reason}.zip`
  await FileManager.zip(DIRS.save, dest, false)
  const all = (await FileManager.readDirectory(DIRS.backups)).filter((n) => n.startsWith('saves-') && n.endsWith('.zip')).sort()
  const auto = all.filter((n) => n.includes('-auto'))
  for (const n of auto.slice(0, Math.max(0, auto.length - keep))) await removeIfExists(`${DIRS.backups}/${n}`)
  log('info', 'backup written: ' + dest)
  return dest
}

export async function listBackups(): Promise<{ name: string; path: string; size: number }[]> {
  if (!(await exists(DIRS.backups))) return []
  const names = (await FileManager.readDirectory(DIRS.backups)).filter((n) => n.endsWith('.zip')).sort().reverse()
  const out = []
  for (const name of names) {
    const path = `${DIRS.backups}/${name}`
    out.push({ name, path, size: (await FileManager.stat(path)).size })
  }
  return out
}

/** Validate a save archive (backup or user import) before extraction. */
export async function inspectSaveZip(path: string): Promise<string[]> {
  const size = (await FileManager.stat(path)).size
  const all = await FileManager.readAsData(path)
  const tail = all.slice(Math.max(0, size - 70000)).toUint8Array()
  if (!tail) throw new Error('cannot read archive')
  const eocd = findEocd(tail, size)
  const cd = all.slice(eocd.cdOffset, eocd.cdOffset + eocd.cdSize).toUint8Array()
  if (!cd) throw new Error('cannot read archive directory')
  const scan = checkEntries(parseCentralDirectory(cd, eocd.count))
  const problems = [...scan.problems]
  for (const e of scan.entries) {
    const rel = e.name.replace(/\/$/, '')
    if (!e.isDirectory && classifySavePath(rel).kind !== 'user') problems.push(`not user data: ${e.name}`)
  }
  return problems
}

/** Replace the save mirror with the contents of a validated archive. */
export async function restoreFromZip(path: string): Promise<void> {
  const problems = await inspectSaveZip(path)
  if (problems.length) throw new Error('Archive rejected:\n' + problems.slice(0, 10).join('\n'))
  await pendingWrites()
  const staging = `${DIRS.tmp}/restore-${Date.now()}`
  await ensureDir(staging)
  await FileManager.unzip(path, staging)
  // the archive either contains the files directly or one top-level folder
  let root = staging
  const top = await FileManager.readDirectory(staging)
  if (top.length === 1 && (await FileManager.isDirectory(`${staging}/${top[0]}`))) root = `${staging}/${top[0]}`
  const old = `${DIRS.save}.old-${Date.now()}`
  if (await exists(DIRS.save)) await FileManager.rename(DIRS.save, old)
  try {
    await FileManager.rename(root, DIRS.save)
    await removeIfExists(old)
  } catch (e) {
    if (await exists(old)) await FileManager.rename(old, DIRS.save)
    throw e
  } finally {
    await removeIfExists(staging)
  }
  log('info', 'saves restored from ' + path)
}
