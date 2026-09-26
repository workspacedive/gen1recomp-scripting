import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRuntimeBridgeMessage } from '../scripting/Gen1Recomp/runtime-bridge.js'
import {
  BRIDGED_RUNTIME_PATHS, RUNTIME_RESOURCE_CHUNK_BYTES, parseRuntimeResourceRequest,
} from '../scripting/Gen1Recomp/runtime-resource.js'

test('resource bridge is allowlisted and range-bounded', () => {
  assert.deepEqual(BRIDGED_RUNTIME_PATHS, [
    'nogame.love', 'lua/normalize1.lua', 'lua/normalize2.lua', '11.5/love.wasm',
  ])
  const valid = parseRuntimeBridgeMessage({
    protocolVersion: 1,
    type: 'resource.read',
    detail: '11.5/love.wasm',
    data: { path: '11.5/love.wasm', offset: 0, length: RUNTIME_RESOURCE_CHUNK_BYTES },
  })
  assert.ok(valid)
  assert.deepEqual(parseRuntimeResourceRequest(valid), {
    path: '11.5/love.wasm', offset: 0, length: RUNTIME_RESOURCE_CHUNK_BYTES,
  })

  for (const data of [
    { path: '../Saves/private', offset: 0, length: 1 },
    { path: '11.5/love.wasm', offset: -1, length: 1 },
    { path: '11.5/love.wasm', offset: 0, length: 0 },
    { path: '11.5/love.wasm', offset: 0, length: RUNTIME_RESOURCE_CHUNK_BYTES + 1 },
  ]) {
    const message = parseRuntimeBridgeMessage({
      protocolVersion: 1, type: 'resource.read', detail: 'invalid', data,
    })
    assert.ok(message)
    assert.equal(parseRuntimeResourceRequest(message), null)
  }
})
