// Builds the game launch request (command-line arguments + environment) from
// the host state, using ONLY the game's documented launch interface
// (src/core/LaunchOptions.lua and the POKEPORT_* variables in main.lua).
// SPDX-License-Identifier: GPL-3.0-or-later

import { BRIDGE_ENV, GAME_IDENTITY, GameId, isGameId } from './constants'
import type { Settings } from './settings'

export interface LaunchRequest {
  game?: GameId
  /** "slotN" (LaunchOptions validates ^slot%d+$ style ids) */
  slot?: string
  /** Path of a staged ROM inside the love.js FS -> headless import. */
  importRomPath?: string
  /** Open the official launcher instead of booting a game. */
  launcher?: boolean
}

export interface LaunchPlan {
  args: string[]
  env: Record<string, string>
  identity: string
}

const SLOT_RE = /^slot\d{1,4}$/

export function buildLaunchPlan(req: LaunchRequest, settings: Settings): LaunchPlan {
  const args: string[] = []
  const env: Record<string, string> = {
    [BRIDGE_ENV]: '1',          // force-enable the platform bridge mod
    POKEPORT_NO_DISCORD: '1',   // no Discord IPC in a browser
    POKEPORT_NO_THREAD: '1',    // importer/audio use their synchronous paths
  }
  if (req.importRomPath) {
    // Scripted import: RomImporter imports then boots that version itself.
    if (!/^\/rd\/rom\/[A-Za-z0-9_.-]+$/.test(req.importRomPath)) throw new Error('invalid ROM staging path')
    env.POKEPORT_IMPORT_ROM = req.importRomPath
    if (req.game && isGameId(req.game)) env.POKEPORT_VERSION = req.game
  } else if (req.launcher) {
    args.push('--launcher')
  } else if (req.game) {
    if (!isGameId(req.game)) throw new Error('unknown game ' + req.game)
    // "--game=red" spelling: "--game red" would be taken as a game path by
    // LÖVE's boot.lua (documented in LaunchOptions.lua).
    args.push(`--game=${req.game}`)
    if (req.slot) {
      if (!SLOT_RE.test(req.slot)) throw new Error('invalid slot id')
      args.push(`--slot=${req.slot}`)
    }
    args.push('--no-sync')
  }
  if (settings.debug) env.POKEPORT_CONSOLE = '1'
  return { args, env, identity: GAME_IDENTITY }
}

/**
 * Translate deep-link query parameters (scripting://run/RecompDeck?game=red&slot=slot2)
 * into a launch request. Mirrors the official gen1recomp++://launch keys.
 */
export function requestFromQuery(q: Record<string, unknown> | null | undefined): LaunchRequest | null {
  if (!q) return null
  const game = typeof q.game === 'string' ? q.game.toLowerCase() : undefined
  if (!game || !isGameId(game)) return null
  const slot = typeof q.slot === 'string' && SLOT_RE.test(q.slot) ? q.slot
    : typeof q.slot === 'string' && /^\d{1,4}$/.test(q.slot) ? `slot${q.slot}` : undefined
  return { game, slot }
}
