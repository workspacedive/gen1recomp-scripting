import assert from 'node:assert/strict'
import test from 'node:test'
import { joinUnderRoot, safeSegment, storageLayout } from '../src/domain/paths.js'

test('visible storage layout is rooted below Documents', () => {
  const layout = storageLayout('/Documents/')
  assert.equal(layout.root, '/Documents/Gen1Recomp')
  assert.equal(layout.saves, '/Documents/Gen1Recomp/Saves')
  assert.equal(layout.cache, '/Documents/Gen1Recomp/Cache')
})

test('path traversal and separators are rejected', () => {
  for (const value of ['..', '.', '../Core', '/absolute', 'a/b', 'a\\b', '', 'x\0y']) {
    assert.throws(() => safeSegment(value))
  }
  assert.equal(joinUnderRoot('/root', 'Cores', 'v0.3.18'), '/root/Cores/v0.3.18')
})
