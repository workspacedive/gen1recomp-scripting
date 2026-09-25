// File-system adapter over Scripting's FileManager (free tier).
// Layout (visible in the Files app under "Scripting/RecompDeck"):
//   runtime/<pinId>/        love.js + love.wasm (verified)
//   games/<version>/        official gen1recomp-<version>.love (+ meta.json)
//   roms/                   user-supplied, SHA-1 verified ROMs
//   save/<identity>/        mirror of the game's save directory (user data)
//   cache/<game>.rdpk       ROM-derived import cache per game (RDPK pack)
//   mods/<id>/              installed mods (+ mods/state.json)
//   backups/                zipped save-directory snapshots
//   player/                 WebView session directory (regenerated)
//   logs/                   session logs
// SPDX-License-Identifier: GPL-3.0-or-later

import { GAME_IDENTITY } from '../core/constants'

export const ROOT = FileManager.documentsDirectory + '/RecompDeck'

export const DIRS = {
  root: ROOT,
  runtime: ROOT + '/runtime',
  games: ROOT + '/games',
  roms: ROOT + '/roms',
  save: ROOT + '/save/' + GAME_IDENTITY,
  cache: ROOT + '/cache',
  mods: ROOT + '/mods',
  backups: ROOT + '/backups',
  player: ROOT + '/player',
  logs: ROOT + '/logs',
  tmp: FileManager.temporaryDirectory + '/RecompDeck',
}

export async function ensureDir(path: string): Promise<void> {
  if (!(await FileManager.exists(path))) await FileManager.createDirectory(path, true)
}

export async function ensureLayout(): Promise<void> {
  for (const d of Object.values(DIRS)) await ensureDir(d)
}

export async function exists(path: string): Promise<boolean> {
  return FileManager.exists(path)
}

export async function removeIfExists(path: string): Promise<void> {
  if (await FileManager.exists(path)) await FileManager.remove(path)
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

/** Write via a temporary file + rename so readers never see partial files. */
export async function writeDataAtomic(path: string, data: Data): Promise<void> {
  await ensureDir(parentOf(path))
  const tmp = path + '.tmp-' + Date.now().toString(36)
  await FileManager.writeAsData(tmp, data)
  await removeIfExists(path)
  await FileManager.rename(tmp, path)
}

export async function writeTextAtomic(path: string, text: string): Promise<void> {
  await ensureDir(parentOf(path))
  const tmp = path + '.tmp-' + Date.now().toString(36)
  await FileManager.writeAsString(tmp, text)
  await removeIfExists(path)
  await FileManager.rename(tmp, path)
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    if (!(await FileManager.exists(path))) return fallback
    return JSON.parse(await FileManager.readAsString(path)) as T
  } catch {
    return fallback
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, JSON.stringify(value, null, 1))
}

export async function fileSize(path: string): Promise<number> {
  const st = await FileManager.stat(path)
  return st.size
}

/** Recursively list files below `dir` as relative paths (directories excluded unless asked). */
export async function listTree(dir: string, includeDirs = false): Promise<string[]> {
  const out: string[] = []
  if (!(await FileManager.exists(dir))) return out
  const walk = async (rel: string) => {
    const abs = rel ? dir + '/' + rel : dir
    const names = await FileManager.readDirectory(abs)
    names.sort()
    for (const name of names) {
      const childRel = rel ? rel + '/' + name : name
      const childAbs = dir + '/' + childRel
      if (await FileManager.isDirectory(childAbs)) {
        if (includeDirs) out.push(childRel + '/')
        await walk(childRel)
      } else {
        out.push(childRel)
      }
    }
  }
  await walk('')
  return out
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  for (const rel of await listTree(dir)) {
    try { total += (await FileManager.stat(dir + '/' + rel)).size } catch { /* raced */ }
  }
  return total
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
