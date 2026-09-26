import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { LOVEJS_RUNTIME } from '../scripting/Gen1Recomp/runtime-manifest.js'

const root = new URL('../scripting/Gen1Recomp/runtime/lovejs/', import.meta.url)

test('vendored love.js candidate exactly matches the pinned inventory', async () => {
  assert.equal(LOVEJS_RUNTIME.sourceRevision, '9355186de22db13bd88bf2a0db75d2925647d036')
  assert.equal(LOVEJS_RUNTIME.loveVersion, '11.5')
  assert.equal(new Set(LOVEJS_RUNTIME.files.map((file) => file.path)).size, LOVEJS_RUNTIME.files.length)
  for (const file of LOVEJS_RUNTIME.files) {
    const bytes = await readFile(new URL(file.path, root))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
  }
})

test('runtime adapter keeps the upstream player and runtime as opaque pinned files', async () => {
  const player = await readFile(new URL('player.js', root), 'utf8')
  assert.match(player, /Player\.start\(uri, arg\)/)
  assert.match(player, /Player\.script\(Player\.version\+'\/love\.js'/)
  const harness = await readFile(new URL('harness.html', root), 'utf8')
  assert.match(harness, /window\.webkit\.messageHandlers\.runtimeEvent\.postMessage/)
  assert.match(harness, /player\.js\?g=nogame\.love&v=11\.5&n=1/)
})

test('native host watchdog prevents an unanswered WebView bridge from hanging the UI', async () => {
  const adapter = await readFile(new URL('../../runtime-store.ts', root), 'utf8')
  assert.match(adapter, /Promise\.race\(\[execution, hostTimeout\]\)/)
  assert.match(adapter, /40000/)
  assert.match(adapter, /lovejs-boot-progress\.v1\.json/)
})
