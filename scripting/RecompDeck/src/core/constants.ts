// Shared constants. Pure module (no Scripting globals) so it is unit-testable.
// SPDX-License-Identifier: GPL-3.0-or-later

export const APP_NAME = 'RecompDeck'
export const APP_VERSION = '1.0.0'

/** Mandatory attribution (gen1recomp LICENSE.MD, Additional Terms §1). */
export const CREDIT_LINE =
  'Based on the Pokemon Gen 1 Recompilation Project by BOIS CLUB GAMES, LLC (https://github.com/bryanthaboi/gen1recomp)'

export const UPSTREAM_REPO = 'bryanthaboi/gen1recomp'
export const UPSTREAM_URL = 'https://github.com/bryanthaboi/gen1recomp'
export const PROJECT_URL = 'https://github.com/workspacedive/gen1recomp-scripting'

/** LÖVE identity of the game (conf.lua default) = save directory name. */
export const GAME_IDENTITY = 'pokemon-love2d'

/** Env var that force-enables the bundled platform bridge mod. */
export const BRIDGE_ENV = 'RECOMPDECK_BRIDGE'
export const BRIDGE_MOD_ID = 'recompdeck_bridge'

export type GameId =
  | 'red' | 'blue' | 'yellow'
  | 'gold' | 'silver' | 'crystal'
  | 'firered' | 'leafgreen'

export interface GameInfo {
  id: GameId
  title: string
  generation: 1 | 2 | 3
  /** Whether the web runtime can run it (Gen 3 needs `goto`, see docs). */
  supported: boolean
  /** gen1recomp support level upstream. */
  upstream: 'stable' | 'phase1' | 'beta'
  color: string
}

export const GAMES: GameInfo[] = [
  { id: 'red', title: 'Red', generation: 1, supported: true, upstream: 'stable', color: '#E3350D' },
  { id: 'blue', title: 'Blue', generation: 1, supported: true, upstream: 'stable', color: '#2A75BB' },
  { id: 'yellow', title: 'Yellow', generation: 1, supported: true, upstream: 'stable', color: '#F7C600' },
  { id: 'gold', title: 'Gold', generation: 2, supported: true, upstream: 'phase1', color: '#C9A227' },
  { id: 'silver', title: 'Silver', generation: 2, supported: true, upstream: 'phase1', color: '#A7A9AC' },
  { id: 'crystal', title: 'Crystal', generation: 2, supported: true, upstream: 'phase1', color: '#6CC5D9' },
  { id: 'firered', title: 'FireRed', generation: 3, supported: false, upstream: 'beta', color: '#F15A24' },
  { id: 'leafgreen', title: 'LeafGreen', generation: 3, supported: false, upstream: 'beta', color: '#39B54A' },
]

export function gameInfo(id: string): GameInfo | undefined {
  return GAMES.find((g) => g.id === id)
}

export function isGameId(id: unknown): id is GameId {
  return typeof id === 'string' && GAMES.some((g) => g.id === id)
}
