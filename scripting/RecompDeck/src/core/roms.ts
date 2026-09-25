// Canonical ROM table (gen1recomp README "ROM verification", v0.3.14).
// A ROM is accepted only if its size AND SHA-1 match an entry; the game
// verifies again during import (defense in depth).
// SPDX-License-Identifier: GPL-3.0-or-later

import type { GameId } from './constants'

export interface RomEntry {
  game: GameId
  revision: string
  size: number
  sha1: string
  ext: 'gb' | 'gbc' | 'gba'
}

const MiB = 1024 * 1024

export const ROMS: RomEntry[] = [
  { game: 'red', revision: '—', size: 1 * MiB, sha1: 'ea9bcae617fdf159b045185467ae58b2e4a48b9a', ext: 'gb' },
  { game: 'blue', revision: '—', size: 1 * MiB, sha1: 'd7037c83e1ae5b39bde3c30787637ba1d4c48ce2', ext: 'gb' },
  { game: 'yellow', revision: '—', size: 1 * MiB, sha1: 'cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1', ext: 'gbc' },
  { game: 'gold', revision: '—', size: 2 * MiB, sha1: 'd8b8a3600a465308c9953dfa04f0081c05bdcb94', ext: 'gbc' },
  { game: 'silver', revision: '—', size: 2 * MiB, sha1: '49b163f7e57702bc939d642a18f591de55d92dae', ext: 'gbc' },
  { game: 'crystal', revision: '1.0', size: 2 * MiB, sha1: 'f4cd194bdee0d04ca4eac29e09b8e4e9d818c133', ext: 'gbc' },
  { game: 'crystal', revision: '1.1', size: 2 * MiB, sha1: 'f2f52230b536214ef7c9924f483392993e226cfb', ext: 'gbc' },
  { game: 'firered', revision: '1.0', size: 16 * MiB, sha1: '41cb23d8dccc8ebd7c649cd8fbb58eeace6e2fdc', ext: 'gba' },
  { game: 'firered', revision: '1.1', size: 16 * MiB, sha1: 'dd5945db9b930750cb39d00c84da8571feebf417', ext: 'gba' },
  { game: 'leafgreen', revision: '1.0', size: 16 * MiB, sha1: '574fa542ffebb14be69902d1d36f1ec0a4afd71e', ext: 'gba' },
  { game: 'leafgreen', revision: '1.1', size: 16 * MiB, sha1: '7862c67bdecbe21d1d69ce082ce34327e1c6ed5e', ext: 'gba' },
]

/** Sizes worth hashing at all (cheap pre-filter before reading a file). */
export const ROM_SIZES = new Set(ROMS.map((r) => r.size))

export function identifyRom(size: number, sha1: string): RomEntry | null {
  const h = sha1.toLowerCase()
  return ROMS.find((r) => r.size === size && r.sha1 === h) ?? null
}

export function romsFor(game: GameId): RomEntry[] {
  return ROMS.filter((r) => r.game === game)
}
