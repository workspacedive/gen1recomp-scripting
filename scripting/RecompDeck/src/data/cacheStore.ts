// ROM-derived import caches, one RDPK pack per game, assembled from the parts
// streamed by the player after the game finished importing a ROM.
// SPDX-License-Identifier: GPL-3.0-or-later

import type { GameId } from '../core/constants'
import { DIRS, ensureDir, exists, readJson, removeIfExists, writeJson } from '../platform/fs'
import { sha256Hex } from '../platform/hash'
import { log } from '../platform/log'

export interface CacheMeta {
  game: string
  size: number
  sha256: string
  gameVersion: string
  createdAt: string
}

interface Assembly { size: number; parts: number; received: number; tmp: string; sha256: string | null; gameVersion: string }
const assemblies = new Map<string, Assembly>()

export const cachePath = (game: string) => `${DIRS.cache}/${game}.rdpk`
const metaPath = (game: string) => `${DIRS.cache}/${game}.json`

export async function cacheMeta(game: GameId): Promise<CacheMeta | null> {
  const meta = await readJson<CacheMeta | null>(metaPath(game), null)
  if (!meta || !(await exists(cachePath(game)))) return null
  return meta
}

export async function beginCache(game: string, size: number, parts: number, sha256: string | null, gameVersion: string) {
  await ensureDir(DIRS.cache)
  const tmp = `${cachePath(game)}.part`
  await removeIfExists(tmp)
  assemblies.set(game, { size, parts, received: 0, tmp, sha256, gameVersion })
}

export async function appendCachePart(game: string, index: number, b64: string) {
  const a = assemblies.get(game)
  if (!a) throw new Error('cache part without begin')
  if (index !== a.received) throw new Error(`cache part out of order (${index} != ${a.received})`)
  const data = Data.fromBase64String(b64)
  if (!data) throw new Error('bad cache part encoding')
  await FileManager.appendData(a.tmp, data)
  a.received++
}

export async function endCache(game: string): Promise<CacheMeta> {
  const a = assemblies.get(game)
  assemblies.delete(game)
  if (!a) throw new Error('cache end without begin')
  if (a.received !== a.parts) throw new Error(`cache incomplete (${a.received}/${a.parts})`)
  const data = await FileManager.readAsData(a.tmp)
  if (data.size !== a.size) throw new Error(`cache size mismatch (${data.size} != ${a.size})`)
  const sha = sha256Hex(data)
  if (a.sha256 && sha !== a.sha256) throw new Error('cache checksum mismatch')
  await removeIfExists(cachePath(game))
  await FileManager.rename(a.tmp, cachePath(game))
  const meta: CacheMeta = { game, size: data.size, sha256: sha, gameVersion: a.gameVersion, createdAt: new Date().toISOString() }
  await writeJson(metaPath(game), meta)
  log('info', `cache stored for ${game}: ${data.size} bytes`)
  return meta
}

export async function removeCache(game: GameId) {
  await removeIfExists(cachePath(game))
  await removeIfExists(metaPath(game))
}
