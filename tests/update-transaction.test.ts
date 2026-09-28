import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransition, transitionUpdate, type UpdateTransaction } from '../src/application/update-transaction.js'

const tx: UpdateTransaction = {
  schemaVersion: 1,
  operationId: 'op-1',
  state: 'idle',
  createdAt: '2026-09-25T00:00:00Z',
  updatedAt: '2026-09-25T00:00:00Z',
  targetVersion: '0.3.18',
  expectedHash: 'a'.repeat(64),
  expectedBytes: 1,
  stagingPath: '/staging',
  targetPath: '/target',
  lastKnownGoodPath: '/lkg',
  errorCode: null,
}

test('update follows staged health checked activation', () => {
  let current = tx
  for (const state of ['checking', 'downloading', 'verifying', 'staged', 'preparing', 'health-check', 'activated', 'monitoring', 'verified'] as const) {
    current = transitionUpdate(current, state, 'later')
  }
  assert.equal(current.state, 'verified')
})

test('unsafe activation is impossible', () => {
  assert.equal(canTransition('downloading', 'activated'), false)
  assert.throws(() => transitionUpdate(tx, 'activated', 'later'))
})
