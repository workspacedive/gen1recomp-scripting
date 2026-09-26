import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRuntimeBridgeMessage } from '../scripting/Gen1Recomp/runtime-bridge.js'

test('runtime bridge accepts only the versioned narrow protocol', () => {
  assert.deepEqual(parseRuntimeBridgeMessage({
    protocolVersion: 1,
    type: 'bridge.ready',
    detail: 'ready',
    data: { webAssembly: true },
  }), {
    protocolVersion: 1,
    type: 'bridge.ready',
    detail: 'ready',
    data: { webAssembly: true },
  })
  for (const value of [
    null,
    { protocolVersion: 2, type: 'bridge.ready', detail: 'wrong version' },
    { protocolVersion: 1, type: 'host.unrestricted', detail: 'unknown command' },
    { protocolVersion: 1, type: 'runtime.ready', detail: 42 },
  ]) assert.equal(parseRuntimeBridgeMessage(value), null)
})
