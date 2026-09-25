// Save-slot discovery and summaries (mirrors SaveData.slotSummary in
// gen1recomp v0.3.14: player name, badges, dex count, play time).
// SPDX-License-Identifier: GPL-3.0-or-later

import type { GameId } from './constants'
import type { LuaTable, LuaValue } from './luaTable'

export interface SlotRef {
  id: string          // "slot1" … or "legacy"
  path: string        // save-directory relative path of the main file
}

export interface SlotSummary {
  name: string | null
  badges: number
  dexCount: number
  timeText: string
  seconds: number
}

const LEGACY_SUFFIX: Record<string, string> = {
  red: '', blue: '_blue', yellow: '_yellow', gold: '_gold', silver: '_silver', crystal: '_crystal',
}

/** Find slot files for a game in a list of save-directory relative paths. */
export function findSlots(game: GameId, files: string[]): SlotRef[] {
  const out: SlotRef[] = []
  const re = new RegExp(`^saves/${game}/(slot\\d+)\\.lua$`)
  for (const f of files) {
    const m = re.exec(f)
    if (m) out.push({ id: m[1], path: f })
  }
  out.sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)))
  const legacy = LEGACY_SUFFIX[game] !== undefined ? `save${LEGACY_SUFFIX[game]}.lua` : null
  if (!out.length && legacy && files.includes(legacy)) out.push({ id: 'legacy', path: legacy })
  return out
}

const tbl = (v: LuaValue | undefined): LuaTable | null => (v && typeof v === 'object' ? (v as LuaTable) : null)
const countTruthy = (t: LuaTable | null) => (t ? Object.values(t).filter((x) => x !== null && x !== false).length : 0)

export function summarizeSave(save: LuaValue): SlotSummary | null {
  const s = tbl(save)
  if (!s) return null
  const player = tbl(s.player)
  const nameV = (player && player.name) ?? s.name ?? s.playerName
  const name = typeof nameV === 'string' ? nameV : null
  const generation = s.generation === 2 || s.generation === 3 ? s.generation : 1
  const dex = tbl(s.pokedex) ?? tbl(s.dex)
  const dexCount = generation === 1 ? countTruthy(tbl(dex?.owned)) : countTruthy(tbl(dex?.caught) ?? tbl(dex?.owned))
  let badges = countTruthy(tbl(player?.badges) ?? tbl(s.badges))
  if (generation === 2) badges += countTruthy(tbl(player?.kantoBadges))
  const pt = s.playTime ?? s.playtime ?? player?.playtime
  let seconds = 0
  const ptt = tbl(pt)
  if (ptt) seconds = (Number(ptt.hours) || 0) * 3600 + (Number(ptt.minutes) || 0) * 60 + (Number(ptt.seconds) || 0)
  else seconds = Math.floor(Number(pt) || 0)
  const timeText = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}`
  return { name, badges, dexCount, timeText, seconds }
}
