import assert from 'node:assert/strict'
import test from 'node:test'
import { identifyGame, KNOWN_GAMES } from '../scripting/Gen1Recomp/game-manifest.js'

test('canonical upstream Gen 1 hashes identify supported games', () => {
  assert.equal(KNOWN_GAMES.length, 3)
  assert.equal(identifyGame('ea9bcae617fdf159b045185467ae58b2e4a48b9a')?.id, 'red')
  assert.equal(identifyGame('D7037C83E1AE5B39BDE3C30787637BA1D4C48CE2')?.id, 'blue')
  assert.equal(identifyGame('cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1')?.id, 'yellow')
  assert.equal(identifyGame('0'.repeat(40)), null)
})
