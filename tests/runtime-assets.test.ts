import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { LOVEJS_RUNTIME } from '../scripting/Gen1Recomp/runtime-manifest.js'

const root = new URL('../scripting/Gen1Recomp/runtime/lovejs/', import.meta.url)

test('vendored love.js candidate exactly matches the pinned inventory', async () => {
  assert.equal(LOVEJS_RUNTIME.sourceRevision, '9355186de22db13bd88bf2a0db75d2925647d036')
  assert.equal(LOVEJS_RUNTIME.loveVersion, '11.5')
  assert.equal(LOVEJS_RUNTIME.id, 'lovejs-11.5-r14')
  assert.equal(LOVEJS_RUNTIME.adapterVersion, 14)
  assert.equal(LOVEJS_RUNTIME.bridgeProtocol, 1)
  assert.equal(LOVEJS_RUNTIME.updatePolicy, 'reviewed-side-by-side-candidate')
  assert.equal(new Set(LOVEJS_RUNTIME.files.map((file) => file.path)).size, LOVEJS_RUNTIME.files.length)
  for (const file of LOVEJS_RUNTIME.files) {
    const source = file.path.startsWith('adapter/') ? new URL(`../${file.path}`, root) : new URL(file.path, root)
    const bytes = await readFile(source)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
  }
})

test('runtime adapter keeps the upstream player and runtime as opaque pinned files', async () => {
  const player = await readFile(new URL('player.js', root), 'utf8')
  assert.match(player, /Player\.start\(uri, arg\)/)
  assert.match(player, /Player\.script\(Player\.version\+'\/love\.js'/)
  const harness = await readFile(new URL('harness.html', root), 'utf8')
  assert.match(harness, /window\.webkit\.messageHandlers\.gen1HostBridge\.postMessage/)
  assert.match(harness, /player\.js\?g=norun&v=11\.5&n=1/)
  assert.match(harness, /Player\.start\(gamePath, \[\]\)/)
  assert.match(harness, /cache\[path\] = resourceCache\[path\]/)
  assert.match(harness, /bridge\.send\('session\.config'/)
  assert.match(harness, /typeof config\.touchController !== 'boolean'/)
  assert.match(harness, /enableTouchController\(\)/)
  assert.match(harness, /data-key="ArrowUp"/)
  assert.match(harness, /data-key="z"/)
  assert.match(harness, /data-key="Escape"/)
  assert.match(harness, /bridge\.send\('bridge\.ready'/)
  assert.match(harness, /bridge\.send\('resources\.ready'/)
  assert.match(harness, /bridge\.send\('resource\.read'/)
  assert.match(harness, /transport: 'gen1HostBridge'/)
  assert.match(harness, /playerUri: window\.Player/)
  assert.match(harness, /consoleErrors\.push/)
  assert.match(harness, /bridge\.send\('runtime\.error', detail/)
  assert.doesNotMatch(harness, /WebAssembly\.(?:Module|Instance|validate|instantiate)/)
})

test('host normalization overlay preserves upstream bytes and supplies reviewed compatibility hooks', async () => {
  const upstream = await readFile(new URL('lua/normalize1.lua', root), 'utf8')
  const adapter = await readFile(new URL('../adapter/normalize1.lua', root), 'utf8')
  const upstream2 = await readFile(new URL('lua/normalize2.lua', root), 'utf8')
  const adapter2 = await readFile(new URL('../adapter/normalize2.lua', root), 'utf8')
  assert.ok(adapter.startsWith(upstream))
  assert.ok(adapter2.startsWith(upstream2))
  for (const operation of ['band', 'bor', 'bxor', 'bnot', 'lshift', 'rshift', 'arshift', 'rol', 'tobit']) {
    assert.match(adapter, new RegExp(`function (?:unsigned|signed)\\.${operation}\\b`), operation)
  }
  assert.match(adapter, /nativeGetTime = timer and timer\.getTime/)
  assert.match(adapter2, /nativeNewQueueableSource = audio and audio\.newQueueableSource/)
  assert.match(adapter2, /newQueueableSource returned \[/)
  assert.match(adapter, /value == value/)
  assert.match(adapter, /if value < last then return last end/)
  assert.match(adapter, /name == "src\.core\.ChipAudio"/)
  assert.match(adapter, /ChipAudio\.playMusic returned/)
  assert.match(adapter, /name == "src\.ui\.kit\.Theme"/)
  assert.match(adapter, /math\.floor\(position\) % count/)
  assert.match(adapter, /nativeLoadString, nativeSetfenv = load, loadstring, setfenv/)
  assert.match(adapter, /load = function\(chunk, chunkname, mode, environment\)/)
  assert.match(adapter, /nativeSetfenv\(fn, environment\)/)
  assert.match(adapter, /package\.loaded\.bit32, package\.loaded\.bit = unsigned, signed/)
  assert.match(adapter, /name == "POKEPORT_IMPORT_ROM"/)
  assert.match(adapter, /name == "POKEPORT_FORCE_IMPORT"/)
  assert.match(adapter, /\/usr\/local\/share\/lua\/5\.1\/import\.gb/)
  assert.match(adapter, /self\.__hostLoadError = results\[2\]/)
  assert.match(adapter, /game boot failed before the first draw/)
})

test('capability probe does not instantiate or inspect WASM directly', async () => {
  const probe = await readFile(new URL('../../capability-probe.ts', root), 'utf8')
  assert.doesNotMatch(probe, /WebAssembly\.(?:Module|Instance|validate|instantiate)/)
  assert.match(probe, /not-run-host-bridge-policy/)
})

test('native host watchdog prevents an unanswered WebView bridge from hanging the UI', async () => {
  const adapter = await readFile(new URL('../../runtime-store.ts', root), 'utf8')
  assert.match(adapter, /Promise\.race\(\[execution, hostTimeout\]\)/)
  assert.match(adapter, /hostTimeoutMs: 40_000/)
  assert.match(adapter, /lovejs-boot-progress\.v2\.json/)
  assert.match(adapter, /gen1recomp-payload-boot\.v1\.json/)
  assert.match(adapter, /-runtime-error\.v1\.json/)
  assert.doesNotMatch(adapter, /addScriptMessageHandler\("gen1HostBridge", async/)
  assert.match(adapter, /FileManager\.writeAsString\(runtimeErrorPath/)
  assert.match(adapter, /touchController: options\.touchController === true/)
  assert.match(adapter, /touchController: true/)
})
