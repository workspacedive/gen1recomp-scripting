# Architecture

RecompDeck = a native launcher (TSX in the Scripting app) + a sandboxed web
player (WKWebView running love.js) + a Lua bootstrap that adapts the
unmodified gen1recomp game to that runtime.

```
┌──────────────────────── Scripting app (JavaScriptCore, TSX) ────────────────────────┐
│ index.tsx ─ HomeView/GameView/Releases/Mods/Saves/Settings/Diagnostics/About (ui/)   │
│      │ useModel()                                                                    │
│ app/model.ts  (single source of truth, all user actions)                             │
│      ├── runtime/runtimeManager.ts  love.js from npm (SHA-1 + pinned SHA-256)        │
│      ├── runtime/gameManager.ts     official release + sha256sums.txt                 │
│      ├── data/romStore · saveStore · cacheStore · modStore                            │
│      └── player/session.ts ─ publishes blobs, owns WebViewController + bridge         │
│             core/* (pure, unit-tested): pins, launch, bridgeSchema, paths, zipScan,  │
│             manifest, rdpk, archive, luaTable, slots, settings, semver, i18n, roms    │
│             platform/*: fs, net, hash, log, settingsStore, haptics                    │
└───────────────┬─────────────────────────────────────────────▲───────────────────────┘
   loadFile(player.html)  evaluateJavaScript("RD.receive…")    │ postMessage "rd" (validated)
┌───────────────▼──────────────── WKWebView (file://, strict CSP) ─────────────────────┐
│ player.js: chunk loader + integrity, love.js Module, FS setup (packs), bridge,       │
│            rAF wrapper (frame cap + cooperative pacing), fault monitor, persistence  │
│ love.wasm (LÖVE 11.5, Lua 5.1, WebGL1)                                                │
│   /rd/host  ← Lua bootstrap pack: conf.lua, main.lua, rd_host/*                       │
│   save dir  ← user data + enabled mods + recompdeck_bridge mod (+ import cache pack)  │
│   .rd/game.love ← official archive, mounted read-only ahead of /rd/host               │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. Layers

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/ui/*.tsx`, `index.tsx` | SwiftUI-style screens; no logic beyond presentation |
| Model | `src/app/model.ts` | state, actions, progress, error reporting; `useModel()` subscription |
| Domain (pure) | `src/core/*` | validation, formats, launch planning; no Scripting globals → unit-testable in Node (`npm test`) |
| Platform adapters | `src/platform/*` | the only places that touch `FileManager`, `fetch`, `Crypto`, `Storage`, `HapticFeedback` |
| Data stores | `src/data/*` | ROMs, saves mirror + backups, import caches, mods |
| Runtime/game managers | `src/runtime/*` | install/verify love.js and the official game archive |
| Player | `src/player/*` | blob publishing, session lifecycle, bridge endpoint |
| Web runtime | `runtime/web/*` | page-side runtime (plain ES5-compatible JS, no build step) |
| Lua runtime | `runtime/lua/*` | compat layer, firewall, platform shims, persistence, boot |
| Bridge mod | `runtime/mods/recompdeck_bridge` | uses gen1recomp's official process-lifecycle hooks |

Dependency rule: `ui → app → (runtime|data|player) → (core|platform)`;
`core` depends on nothing.

## 2. Start of a session

1. `model.play(game, slot)` → `planLaunch()` decides the launch request:
   **play** (`--game=<id> [--slot=slotN] --no-sync`) when an import cache for
   the installed game version exists, otherwise a **headless import**
   (`POKEPORT_IMPORT_ROM`, `POKEPORT_VERSION`) when a verified ROM is present;
   otherwise the user is asked to add the ROM. The game's own (proprietary)
   launcher is never started — `buildLaunchPlan` cannot express it.
2. `PlayerSession.prepare()`:
   - copies `player.html/js/css` and `love.js` into `Documents/RecompDeck/player/`;
   - publishes `love.wasm`, the game archive, the Lua bootstrap pack, the save
     pack (user files + enabled mods + bridge mod) and, if applicable, the
     import-cache pack or the staged ROM as content-addressed chunk sets;
   - writes `config.js` (launch args/env from `core/launch.ts`, settings,
     blob descriptors with SHA-256) and prunes unused blobs.
3. `start()` installs `shouldAllowRequest` (`isFileUrlInside`), the `rd`
   message handler, then `loadFile(player.html, allowingReadAccessTo: player/)`.
4. The page loads chunks via `<script src>`, verifies SHA-256 (WebCrypto,
   when available), creates the Emscripten module, unpacks the packs into the
   FS, mounts the game archive and starts LÖVE with the planned arguments.
5. LÖVE runs our `conf.lua` → `rd_host/boot.lua`:
   compat layer → environment overlay (`os.getenv`) → identity → mount the
   official archive → official `conf.lua`; then the official `main.lua` with
   platform shims, firewall, persistence hooks and the frame wrapper.

## 3. Bridge protocol

Page → host (`window.webkit.messageHandlers.rd.postMessage`), validated by
`core/bridgeSchema.ts`:

| Topic | Purpose |
|---|---|
| `stage`, `ready`, `log`, `error`, `engineFault` | lifecycle and diagnostics |
| `persist.user` | batch of changed user files / removals / directories |
| `persist.cache.begin/part/end` | streamed import-cache pack (RDPK) |
| `quit`, `quitToLauncher` | game exit / "return to launcher" |
| `haptic`, `openURL` | native services (validated, URL confirmed by the user) |
| `stats`, `perf`, `selftest`, `diagnostics`, `pong` | metrics |

Host → page (`evaluateJavaScript("return RD.receive(topic, data)")`):
`pause`, `resume`, `flush`, `setFpsCap`, … Lua ↔ page uses in-FS mailboxes
(`/rd/inbox`, `/rd/reply`) and a binary device file (`/rd/dev/persist`).

## 4. Persistence model

- The **host** owns persistence (IDBFS is not used): the save directory is
  mirrored in `Documents/RecompDeck/save/` (user data only) and replayed into
  the in-memory FS at every start.
- Paths are classified (`classifySavePath`): user data (saves, options,
  prints, mod storage) vs. ROM-derived caches (`<ver>/data/generated`,
  `<ver>/assets/generated`, `rom-cache.complete`) which go into per-game RDPK
  packs in `cache/`.
- Rolling backups before each session (setting), manual backup, export/import
  via validated ZIPs.

## 5. File layout on the device

`Documents/RecompDeck/` (visible in the Files app under Scripting):

| Directory | Content |
|---|---|
| `runtime/<pin>/` | `love.js`, `love.wasm`, `runtime.json` |
| `games/` | official game archive(s) + metadata |
| `roms/` | user ROMs (verified) |
| `save/pokemon-love2d/` | mirror of the game's save directory (user data; LÖVE identity `pokemon-love2d`) |
| `cache/` | per-game import-cache packs (`<game>.rdpk` + `.json`) |
| `mods/` | installed mods (`<id>/`, validated) |
| `backups/` | ZIP backups |
| `player/` | page files + content-addressed blobs (derived, disposable) |
| `logs/` | per-day log files |

Temporary files go to `FileManager.temporaryDirectory/RecompDeck`. (Exact names: `src/platform/fs.ts` `DIRS`.)

## 6. Extension points

- New Scripting API: skill S1 (free-tier check) → adapter in `src/platform`.
- New throwing LÖVE API: skill S4 (firewall rule).
- New game release: skills S2 + S6 (audit, pins).
- New bridge topic: extend `bridgeSchema.ts` (+ unit test), `player.js`,
  `session.ts`; document here.
- UI strings: `src/core/i18n.ts` (German + English).
