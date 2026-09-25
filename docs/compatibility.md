# Compatibility

How RecompDeck runs the **unmodified** gen1recomp v0.3.14 game archive on
love.js (LÖVE 11.5 → WebAssembly) inside WKWebView, which gaps exist between
that runtime and the game's native LuaJIT/LÖVE target, how each gap is closed,
and what remains unsupported. Every number below was produced by a command in
this repository (see [verification.md](verification.md)).

## 1. Runtime facts (verified)

| Property | Native gen1recomp | RecompDeck (love.js 11.5.1 "compat") |
|---|---|---|
| LÖVE | 11.5 (desktop), love-android 11.5a | 11.5 (`@jeduden-love2d/love.js@11.5.1`, pinned, SHA-256-verified) |
| Lua VM | LuaJIT 2.1 | PUC Lua 5.1.5 (no JIT, no FFI, no `bit`) |
| Graphics | OpenGL / GLES 2–3 / Metal (via LÖVE) | WebGL 1, GLSL ES 1.00 |
| Threads | `love.thread` | not available → game's synchronous paths (`POKEPORT_NO_THREAD=1`) |
| C++ exceptions | caught by LÖVE's wrappers | **not catchable** (no landing pads) → firewall, §4 |
| Save dir | OS user dir | in-memory FS, mirrored by the host (§5) |
| Timing | `love.timer.sleep` blocks | must never block → cooperative pacing ([performance.md](performance.md)) |

The love.js build with SharedArrayBuffer/pthreads (`2dengine/love.js` 11.5)
needs COOP/COEP headers that a `file://` WKWebView page cannot provide; it is
therefore not used.

## 2. Static audit of the game archive (Lua 5.1 syntax)

Tools: `tools/audit/lua51_syntax_check.py`, `lua_escape_scan.py`,
`require_graph.py` (skill S2).

| Metric | Result |
|---|---|
| Lua files in the v0.3.14 game archive | 1068 |
| compile on PUC Lua 5.1 as-is | 1062 |
| fail on Lua 5.1 | 6, all in `src/import/gba/` (Gen 3 ROM importer): 5 × `goto`/labels, 1 × shebang line |
| files needing escape rewrites (`\xHH`, `\u{…}`, `\z`) | 27 (2921 literals, 149 rewrites) — none is a proprietary launcher file |
| modules transitively depending on the 6 failing files | 11 top-level modules, all Gen 3 (`--top-level` require graph) |

The whole upstream checkout (incl. `tests/`, `tools/`) has 44 files with such
escapes (8592 literals, 322 rewrites); two of them do not compile on Lua 5.1
for reasons unrelated to escapes and are not part of the game archive
(`tests/lua/expected_transform_compile_failures.txt`).

## 3. Language/library gaps and fixes (`rd_host/compat.lua`)

| Gap (LuaJIT 2.1 / Lua 5.2 feature used by the game) | Fix | Evidence |
|---|---|---|
| `bit` library (40 modules) | `rd_host/bit.lua`, pure Lua 5.1 LuaBitOp | byte-identical to LuaJIT on 21 700 output lines (`tests/lua/bit_differential.lua`) |
| `\xHH`, `\u{…}`, `\z` escapes | `rd_host/lua51src.lua` source transform on **every** load path (`require`, `load`, `loadstring`, `loadfile`, `dofile`, `love.filesystem.load`) | all literals byte-identical to LuaJIT; idempotent; transformed sources compile (`tests/lua/lua51src_literals.lua`) |
| `load(chunk, name, mode, env)` (5.2) | 5.2-style `load` with mode check and env | upstream tiers |
| `xpcall(f, h, ...)` extra args | forwarded like LuaJIT | upstream tiers |
| `table.unpack/pack/move`, `rawlen` | 5.2/5.3 semantics | upstream tiers |
| `string.rep(s, n, sep)` | separator support | upstream tiers |
| `math.log(x, base)` | base support | upstream tiers |
| `coroutine.running()` two values, `coroutine.isyieldable()` | 5.2 form / approximation | upstream tiers |
| LuaJIT FFI | none needed: 27 call sites in 20 files; 24 use `pcall(require, "ffi")`, the other 3 are unreachable on love.js (`conf.lua:137` macOS-only inside `pcall`; `HostShell.lua:278` Linux `/proc` restart path; `Sensors.lua:123` only after a guarded FFI probe succeeded) | code audit of the shipped archive |
| `goto`/labels | **not fixable at runtime** → Gen 3 unsupported | §7 |

Everything in `compat.lua` is a no-op on LuaJIT or Lua ≥ 5.2, so the same
prelude also drives the native test runs.

## 4. C++ exception firewall (`rd_host/firewall.lua`)

love.js' compat builds have no C++ landing pads in LÖVE's Lua wrappers: a
`love::Exception` (e.g. `love.filesystem.read("missing")`) unwinds to the next
`setjmp` (a Lua `pcall`), is swallowed there and leaves the VM corrupted
("attempt to call a boolean value"). The game probes with `pcall` about 230
times (newImage ×76, newImageData ×48, newShader ×29, filesystem.read ×25,
newCanvas ×15, …). The firewall checks the failure condition in Lua **before**
entering C++ and reproduces LÖVE's native result (`nil, msg` or `error(msg)`),
fully catchable by `pcall`.

| API | Pre-check | Native result reproduced |
|---|---|---|
| `love.filesystem.read`, `.lines`, `.newFileData` | file exists (`getInfo`) | `nil, "Could not open file X. Does not exist."` (read) / the same message as error |
| `love.filesystem.write`, `.append` | parent directory exists, target is not a directory | `nil, "Could not open file X"` |
| `love.filesystem.newFile`, `File:open` | mode + path + parent checks | `nil, msg` |
| `love.graphics.newImage`, `.newImageFont`, `love.image.newImageData` | file exists; magic bytes (PNG, JPEG, BMP, DDS, KTX, PKM, ASTC, Radiance HDR; TGA by extension); ImageData dimensions | LÖVE's decode/dimension error |
| `love.graphics.newCanvas` | dimensions > 0 and ≤ `getSystemLimits().texturesize`; format supported (`getCanvasFormats`); MSAA clamped like LÖVE | LÖVE's canvas error |
| `love.graphics.newShader` | file exists; GLSL compiled first in the page's WebGL context (`glsl.validate`) | LÖVE's shader error |
| `love.audio.newSource`, `love.sound.newSoundData`, `.newDecoder` | file exists; magic bytes (OggS/RIFF/ID3/MP3 sync/tracker by extension) | LÖVE's decode error |

Anything that still throws is detected by the page's swallowed-exception
monitor (`player.js`): the runtime is stopped cleanly (`engineFault`) and no
data produced afterwards is persisted. E2E result: the firewall prevented 19
read exceptions during a real boot to the official launcher, with no
`engineFault`.

## 5. Platform integration gaps

| Gap | Fix |
|---|---|
| `love.timer.sleep` busy-waits (no asyncify) | virtual sleep + `frame.wake` cooperative pacing |
| `setVSync(0)` from the game's `VSync.silenceDriver` switches Emscripten to `setTimeout(0)` (uncapped) | vsync virtualised; the real swap interval stays 1 (rAF) |
| IDBFS flushes only on `beforeunload` (unreliable in WKWebView) | `rd_host/persist.lua` streams every save-dir write to the host (debounced, binary device file) |
| `love.system.vibrate` | host haptics (`HapticFeedback`, free) |
| `love.system.openURL` | host, https only, user confirmation |
| `os.exit` | host "quit" (never tears down the wasm runtime) |
| touch input | OS reported as "iOS" → the game's own touch layout; `POKEPORT_TOUCH` is **not** set (it would double-register touches through the mouse twin) |
| Discord IPC, threads | disabled via the documented `POKEPORT_NO_DISCORD=1`, `POKEPORT_NO_THREAD=1` |

## 6. Upstream test tiers (LuaJIT baseline vs Lua 5.1 + compat)

`tools/verify-lua.sh` (skill S3) runs gen1recomp's own suites on both VMs.

| Tier | LuaJIT 2.1 | Lua 5.1 + compat |
|---|---|---|
| engine (`run_engine.lua`) | 680/681 (¹) | 667/681 |
| gen2 (`run_gen2.lua`) | 149/149 | 149/149 |
| modkit (`run_modkit.lua`) | 37/37 | 37/37 |
| modkit tooling (`modkit_tests.lua`) | 137/137 checks | 137/137 checks |

(¹) `launcher_patch_notes` fails in the sandbox on both VMs (environmental).

The 13 extra engine failures are exactly the list in
`tests/lua/expected_compat_failures.txt` (the script fails on any deviation):
seven `game3_*` suites, `luajit_source_limits_test` (asserts that the goto-based
GBA importer compiles), `nickname_mon_icon_scale_bug2319` and
`nickname_title_fits_box_bug2319` (Gen 3 naming screen),
`oaks_lab_last_ball_bug601` (the test file itself uses `goto`),
`save_menu_badges_bug2405` and `wild_encounter_cooldown` (Gen 3 modules).

## 7. Support matrix

| Game | Upstream status | RecompDeck |
|---|---|---|
| Red / Blue / Yellow | stable | supported |
| Gold / Silver / Crystal | Phase 1 (import + launcher) | supported as far as upstream is |
| FireRed / LeafGreen | beta | **unsupported**: the Gen 3 importer/engine needs `goto`, which PUC Lua 5.1 cannot parse and which cannot be emulated at runtime |

## 8. Graphics support

- WebGL 1 context owned by love.js; the canvas is sized to the safe area
  (or edge-to-edge, setting *fillEdges*) at device pixel ratio (setting
  *highdpi*), upscaled with nearest-neighbour filtering (setting *pixelated*).
- Shaders: every shader source is compiled in the same WebGL context before
  LÖVE sees it; unsupported GLSL fails like native LÖVE (the game falls back
  to its non-shader path) instead of corrupting the VM.
- Canvases respect the real `texturesize`/format/MSAA limits of the device.
- Custom librashader (RetroArch slang) presets need the native ShaderFX
  bridge (`liblibrashader_bridge.so` on Android), loaded through LuaJIT FFI.
  On love.js `ShaderFX` reports *"this build has no ffi, so presets cannot be
  converted here"* and those presets are unavailable; the game's own LÖVE
  (GLSL) shaders are unaffected and pass the pre-validation above.
- Limit of the evidence: the E2E runs reach the official launcher and the
  import flow; in-game rendering (maps, battles, shader presets) needs a
  legally owned ROM and is part of the on-device checklist in
  [verification.md](verification.md).
- ProMotion: frame cap 30/60/120/display (default 60, the game's native rate).

## 9. Mods

See [modding.md](modding.md): mods load through the game's own mod runtime
unchanged; the host adds a least-privilege boundary (`rd_host/guard.lua`) and
validates mod ZIPs before extraction.
