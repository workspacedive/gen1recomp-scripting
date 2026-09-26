import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCompatibility } from '../src/application/compatibility.js'
import { asEntityId, asSha256, type CoreManifest, type LaunchProfile, type LibraryEntry } from '../src/domain/model.js'

const hash = asSha256('a'.repeat(64))
const gameId = asEntityId('red-us')
const coreId = asEntityId('gen1recomp')
const entry: LibraryEntry = {
  schemaVersion: 1, id: gameId, displayName: 'Red', importedAt: 'now', profileIds: [],
  identity: { schemaVersion: 1, id: gameId, sha256: hash, game: 'red', region: 'US', language: 'en', revision: 'canonical', format: 'gb', contentType: 'original', byteLength: 1 },
}
const profile: LaunchProfile = {
  schemaVersion: 1, id: asEntityId('default'), gameId, contentHash: hash, coreId, coreVersion: '0.3.18', modSetHash: null,
  graphicsProfile: 'pixel-perfect', inputProfile: 'touch', audioProfile: 'default', saveProfile: 'main', performanceProfile: 'balanced', language: 'de', accessibility: {}, featureFlags: {},
}
const core: CoreManifest = { schemaVersion: 1, coreId, version: '0.3.18', sourceCommit: 'b83f805', artifactHash: hash, apiVersion: 2, hostContract: 1, minHostVersion: '3.1.0', trust: 'verified-hash', features: [] }

test('unknown hard host capabilities do not become compatible', () => {
  const result = evaluateCompatibility({ entry, profile, core, capabilities: { wasmBasic: null, webgl: null, audio: null, localSubresources: null } })
  assert.equal(result.status, 'unknown')
  assert.equal(result.reasons.length, 4)
})

test('missing capability blocks launch', () => {
  const result = evaluateCompatibility({ entry, profile, core, capabilities: { wasmBasic: true, webgl: false, audio: true, localSubresources: true } })
  assert.equal(result.status, 'incompatible')
})
