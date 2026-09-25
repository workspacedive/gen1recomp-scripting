# Mods

Mod compatibility is a primary goal: RecompDeck does **not** implement its own
mod system. Mods run in gen1recomp's own mod runtime (`src/mods/*`: loader,
sandbox, hooks, registries, manager UI) exactly as on desktop; RecompDeck
installs them safely and makes the runtime work on love.js.

## 1. What is verified

| Evidence | Result |
|---|---|
| Upstream modkit tier (`run_modkit.lua`) on Lua 5.1 + compat | 37/37 (identical to LuaJIT) |
| Upstream modkit tooling (`modkit_tests.lua`) on Lua 5.1 + compat | 137/137 checks (identical to LuaJIT) |
| Escape transform on mod code | applied on every load path the mod runtime uses (`require`, `load`, `loadstring`, `loadfile`, `dofile`, `love.filesystem.load`) |
| Mod ZIP scanner + manifest validator | unit tests (`npm test`) |

Community mods themselves (e.g. the voxel renderers DramaticShapeVoxelMod,
PotatoVoxel) have **not** been run here; see §5 for what can differ.

## 2. Installing a mod in RecompDeck

1. *Mods → Import ZIP* (DocumentPicker).
2. The ZIP's central directory is scanned **before** extraction
   (`src/core/zipScan.ts`): no traversal/absolute paths, symlinks, encrypted
   entries, ZIP64, duplicates; ≤ 4096 entries, ≤ 256 MiB total, ≤ 128 MiB per
   entry, compression ratio ≤ 200.
3. `manifest.json` is validated (`src/core/manifest.ts`, mirrors the game's
   `src/mods/Manifest.lua` v0.3.14): `id` `[A-Za-z0-9_-]{1,64}`, semver
   `version`, `api` 1 or 2, known `category`, `games` tokens (`red` … `all`,
   `gen1`/`gen2`/`gen3`), permissions.
4. A review sheet lists every declared permission (below) before the mod is
   installed to `Documents/RecompDeck/mods/<id>/`.
5. Enabled mods are materialised into the game's save directory
   (`mods/<id>/`) at every session start; the game's loader picks them up. The
   in-game mod manager keeps working (its enable state lives in
   `options.lua` → `options.mods`).

## 3. Permissions (declared in `manifest.json`)

| Permission | Upstream meaning | In RecompDeck |
|---|---|---|
| `engine_internals` | patches engine code (upvalue surgery, internals) | works |
| `filesystem` | reads/writes files in the save directory | works; writes are persisted by the host like any user data |
| `network` | uses the network | **no transport**: love.js has no sockets and the Android HTTP extensions do not exist |
| `steps` | native step counter bridge (`mod.steps`, #1186) | unavailable: `Steps.available()` is false, mods stay dormant (upstream behaviour on desktop) |
| `background` | background jobs (`mod.job`) | unavailable: `Job.available()` is false (no `love.thread`) |
| `compute` | `love.thread` in the sandbox | unavailable (`love.thread` is disabled in the compat runtime) |

## 4. Security boundary

- The game's sandbox (per-mod environments, deny list) stays in force.
- `rd_host/guard.lua`: any `require("rd_host.*")` from a mod raises an error;
  only `rd_host.modapi` is allowed, and only for `recompdeck_bridge`.
- The host validates every bridge message regardless of origin.
- A C++ exception triggered by mod code is either prevented by the firewall
  or detected by the page; the runtime then stops and nothing produced after
  the fault is persisted.

## 5. Writing mods that work everywhere (incl. RecompDeck)

- Target LÖVE 11.5 and **PUC Lua 5.1 syntax**: no `goto`/labels, no integer
  division `//`, no bitwise operators (`&`, `|`, `~`, `<<`, `>>`). Use
  `bit.band` etc. — `bit` exists (bit-exact LuaBitOp).
- `\xHH`, `\u{…}`, `\z` escapes are fine (transformed transparently).
- Do not rely on LuaJIT FFI; guard with `pcall(require, "ffi")`.
- Graphics: WebGL 1 / GLSL ES 1.00. Write shaders in LÖVE's GLSL dialect
  without desktop-only features (no `#version 330`, no integer textures, no
  MRT beyond the device's limits); always create shaders/canvases with
  `pcall` and provide a fallback. Check `love.graphics.getSupported()`,
  `getSystemLimits()` and `getCanvasFormats()`.
- Check feature availability instead of the OS: `Steps.available()`,
  `Job.available()`, `love.thread ~= nil`.
- Keep per-frame work small: there is no JIT; LuaJIT-tuned hot loops run
  several times slower on PUC Lua 5.1.

## 6. Testing a mod locally (headless Chromium)

```bash
npm run harness:setup
npm run harness -- --game .cache/game-0.3.14.love --lovejs .cache/lovejs/compat \
  --file save:mods/<id>/manifest.json:path/to/manifest.json \
  --file save:mods/<id>/main.lua:path/to/main.lua --duration 30 --shots 10,30
```

Inspect `report.json` (`error`, `engineFault`, console) and the screenshots.
In-game testing needs a legally owned ROM (import once, then keep the
save/cache pack with `--save-pack`).
