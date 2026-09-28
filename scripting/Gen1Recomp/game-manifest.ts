// Sourced from Gen1Recomp v0.3.18 src/core/GameVersion.lua at
// b83f805a7c7b6043370b783ea7a4b65fd8c93ef4. Data, not detection logic.
export const KNOWN_GAMES = [
  { id: 'red', displayName: 'Pokémon Red', sha1: 'ea9bcae617fdf159b045185467ae58b2e4a48b9a', region: 'US', language: 'en', revision: 'canonical' },
  { id: 'blue', displayName: 'Pokémon Blue', sha1: 'd7037c83e1ae5b39bde3c30787637ba1d4c48ce2', region: 'US', language: 'en', revision: 'canonical' },
  { id: 'yellow', displayName: 'Pokémon Yellow', sha1: 'cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1', region: 'US', language: 'en', revision: 'canonical' },
] as const

export type KnownGameId = (typeof KNOWN_GAMES)[number]['id']

export function identifyGame(sha1: string) {
  return KNOWN_GAMES.find(game => game.sha1 === sha1.toLowerCase()) ?? null
}
