// User-supplied ROMs: size pre-filter, native SHA-1, canonical table match.
// ROMs never leave the device and are never written anywhere but roms/.
// SPDX-License-Identifier: GPL-3.0-or-later

import type { GameId } from '../core/constants'
import { identifyRom, ROM_SIZES, RomEntry } from '../core/roms'
import { DIRS, ensureDir, exists, readJson, removeIfExists, writeJson } from '../platform/fs'
import { sha1Hex } from '../platform/hash'
import { log } from '../platform/log'

export interface StoredRom extends RomEntry {
  path: string
  importedAt: string
}

const INDEX = () => DIRS.roms + '/roms.json'

export async function listRoms(): Promise<Partial<Record<GameId, StoredRom>>> {
  const idx = await readJson<Partial<Record<GameId, StoredRom>>>(INDEX(), {})
  for (const k of Object.keys(idx) as GameId[]) {
    const r = idx[k]
    if (!r || !(await exists(r.path))) delete idx[k]
  }
  return idx
}

export class RomRejected extends Error {}

/** Verify a picked file and store it. Throws RomRejected with a user-facing reason. */
export async function importRom(srcPath: string): Promise<StoredRom> {
  const st = await FileManager.stat(srcPath)
  if (!ROM_SIZES.has(st.size)) {
    throw new RomRejected(`Unsupported file size (${st.size} bytes). Only clean, unmodified cartridge dumps listed in the gen1recomp README are accepted.`)
  }
  const data = await FileManager.readAsData(srcPath)
  const sha1 = sha1Hex(data)
  const entry = identifyRom(data.size, sha1)
  if (!entry) throw new RomRejected(`Unsupported ROM (SHA-1 ${sha1}). It must be an unmodified US dump of a supported game.`)
  await ensureDir(DIRS.roms)
  const path = `${DIRS.roms}/${entry.game}.${entry.ext}`
  await removeIfExists(path)
  await FileManager.writeAsData(path, data)
  const idx = await readJson<Record<string, StoredRom>>(INDEX(), {})
  const stored: StoredRom = { ...entry, path, importedAt: new Date().toISOString() }
  idx[entry.game] = stored
  await writeJson(INDEX(), idx)
  log('info', `ROM imported: ${entry.game} rev ${entry.revision}`)
  return stored
}

export async function removeRom(game: GameId) {
  const idx = await readJson<Record<string, StoredRom>>(INDEX(), {})
  const r = idx[game]
  if (r) await removeIfExists(r.path)
  delete idx[game]
  await writeJson(INDEX(), idx)
}
