import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('payload network staging is bounded and journals expensive phases', async () => {
  const source = await readFile(new URL('../scripting/Gen1Recomp/component-store.ts', import.meta.url), 'utf8')
  assert.match(source, /AbortSignal\.timeout\(180_000\)/)
  assert.match(source, /payload-stage-progress\.v1\.json/)
  for (const phase of [
    'network-download', 'network-response-data', 'size-and-sha256', 'zip-preflight',
    'payload-metadata', 'transaction-write', 'transaction-rehash', 'atomic-publish',
  ]) assert.match(source, new RegExp(`step\\(\\"${phase}\\"\\)`), phase)
})

test('visual payload preview remains a diagnostic without ROM or save resources', async () => {
  const source = await readFile(new URL('../scripting/Gen1Recomp/runtime-store.ts', import.meta.url), 'utf8')
  assert.match(source, /presentOnReady: true/)
  assert.match(source, /controller\.present\(/)
  assert.match(source, /finalName: \"gen1recomp-preview\.v1\.json\"/)
})
