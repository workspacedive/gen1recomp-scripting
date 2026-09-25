// Mod management: validated ZIP import (central directory scanned before any
// extraction), manifest validation, permission disclosure, enable/disable.
// Enabled mods are injected into the game's save directory as mods/<id>/ at
// launch; the game's own loader, sandbox and disabled-list still apply.
// SPDX-License-Identifier: GPL-3.0-or-later

import { BRIDGE_MOD_ID } from '../core/constants'
import { ModManifest, validateManifest } from '../core/manifest'
import { checkEntries, commonRoot, findEocd, parseCentralDirectory } from '../core/zipScan'
import { DIRS, ensureDir, exists, listTree, readJson, removeIfExists, writeJson } from '../platform/fs'
import { log } from '../platform/log'

export interface ModRecord {
  id: string
  name: string
  version: string
  enabled: boolean
  permissions: string[]
  games: string[]
  category?: string
  description?: string
  author?: string
  installedAt: string
}

interface ModState { mods: Record<string, ModRecord> }

const STATE = () => DIRS.mods + '/state.json'

export async function listMods(): Promise<ModRecord[]> {
  const state = await readJson<ModState>(STATE(), { mods: {} })
  const out: ModRecord[] = []
  for (const rec of Object.values(state.mods)) {
    if (await exists(`${DIRS.mods}/${rec.id}/manifest.json`)) out.push(rec)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function saveState(mutate: (s: ModState) => void) {
  const state = await readJson<ModState>(STATE(), { mods: {} })
  mutate(state)
  await writeJson(STATE(), state)
}

export async function setModEnabled(id: string, enabled: boolean) {
  await saveState((s) => { if (s.mods[id]) s.mods[id].enabled = enabled })
}

export async function removeMod(id: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('invalid mod id')
  await removeIfExists(`${DIRS.mods}/${id}`)
  await saveState((s) => { delete s.mods[id] })
}

export interface ModCandidate {
  manifest: ModManifest
  warnings: string[]
  stagingDir: string
  replaces: ModRecord | null
  fileCount: number
  totalBytes: number
}

export class ModRejected extends Error {}

/** Stage 1: scan + extract to a staging dir + validate. Nothing is installed yet. */
export async function inspectModZip(zipPath: string): Promise<ModCandidate> {
  const size = (await FileManager.stat(zipPath)).size
  if (size > 512 * 1024 * 1024) throw new ModRejected('Archive is larger than 512 MB.')
  const all = await FileManager.readAsData(zipPath)
  const tail = all.slice(Math.max(0, size - 70000)).toUint8Array()
  if (!tail) throw new ModRejected('Cannot read the archive.')
  let scan
  try {
    const eocd = findEocd(tail, size)
    const cd = all.slice(eocd.cdOffset, eocd.cdOffset + eocd.cdSize).toUint8Array()
    if (!cd) throw new Error('cannot read central directory')
    scan = checkEntries(parseCentralDirectory(cd, eocd.count))
  } catch (e) {
    throw new ModRejected(String((e as Error).message ?? e))
  }
  if (scan.problems.length) throw new ModRejected('Unsafe archive:\n' + scan.problems.slice(0, 12).join('\n'))
  const root = commonRoot(scan.entries)
  const staging = `${DIRS.tmp}/mod-${Date.now()}`
  await ensureDir(staging)
  await FileManager.unzip(zipPath, staging)
  const modDir = root ? `${staging}/${root.replace(/\/$/, '')}` : staging
  const manifestPath = `${modDir}/manifest.json`
  if (!(await exists(manifestPath))) {
    await removeIfExists(staging)
    throw new ModRejected('No manifest.json found (expected at the archive root or in its single top-level folder).')
  }
  let raw: unknown
  try { raw = JSON.parse(await FileManager.readAsString(manifestPath)) }
  catch { await removeIfExists(staging); throw new ModRejected('manifest.json is not valid JSON.') }
  const result = validateManifest(raw)
  if (!result.manifest) {
    await removeIfExists(staging)
    throw new ModRejected('Invalid manifest:\n' + result.errors.join('\n'))
  }
  if (result.manifest.entry && !(await exists(`${modDir}/${result.manifest.entry}`))) {
    await removeIfExists(staging)
    throw new ModRejected(`Entry file ${result.manifest.entry} is missing.`)
  }
  const existing = (await listMods()).find((m) => m.id === result.manifest!.id) ?? null
  // keep the staging path of the mod folder itself
  const finalStaging = `${DIRS.tmp}/mod-ready-${Date.now()}`
  await FileManager.rename(modDir, finalStaging)
  await removeIfExists(staging)
  const files = await listTree(finalStaging)
  return {
    manifest: result.manifest,
    warnings: result.warnings,
    stagingDir: finalStaging,
    replaces: existing,
    fileCount: files.length,
    totalBytes: scan.totalUncompressed,
  }
}

/** Stage 2: install the confirmed candidate. */
export async function installCandidate(c: ModCandidate, enable: boolean): Promise<ModRecord> {
  const id = c.manifest.id
  if (id === BRIDGE_MOD_ID) throw new ModRejected('Reserved mod id.')
  await ensureDir(DIRS.mods)
  const dest = `${DIRS.mods}/${id}`
  await removeIfExists(dest)
  await FileManager.rename(c.stagingDir, dest)
  const rec: ModRecord = {
    id,
    name: c.manifest.name,
    version: c.manifest.version,
    enabled: enable,
    permissions: c.manifest.permissions,
    games: c.manifest.games,
    category: c.manifest.category,
    description: c.manifest.description,
    author: c.manifest.author,
    installedAt: new Date().toISOString(),
  }
  await saveState((s) => { s.mods[id] = rec })
  log('info', `mod installed: ${id} ${rec.version} (enabled=${enable})`)
  return rec
}

export async function discardCandidate(c: ModCandidate) {
  await removeIfExists(c.stagingDir)
}
