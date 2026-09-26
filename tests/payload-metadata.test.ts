import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePayloadVersionLua } from '../scripting/Gen1Recomp/payload-metadata.js'

test('payload metadata is parsed without evaluating Lua', () => {
  const metadata = parsePayloadVersionLua(`
    error("must never execute")
    local Version = {
      engine = "0.3.20",
      payloadHost = "love",
      minShell = 1,
    }
  `, '0.3.20')
  assert.deepEqual(metadata, { engine: '0.3.20', payloadHost: 'love', minShell: 1 })
})

test('legacy payload host defaults to ordinary love', () => {
  assert.equal(parsePayloadVersionLua('engine="0.3.20"; minShell=1', '0.3.20').payloadHost, 'love')
})

test('payload engine, host and shell mismatches fail closed', () => {
  for (const source of [
    'engine="0.3.19"; payloadHost="love"; minShell=1',
    'engine="0.3.20"; payloadHost="native-special"; minShell=1',
    'engine="0.3.20"; payloadHost="love"; minShell=0',
    'engine="0.3.20"; payloadHost="love"',
  ]) {
    assert.throws(() => parsePayloadVersionLua(source, '0.3.20'), /unerwartete/)
  }
})
