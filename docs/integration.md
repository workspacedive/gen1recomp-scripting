# Game integration

RecompDeck talks to gen1recomp **only through interfaces the game documents
for launchers and platform ports**. It never patches, copies or replaces game
files; the official archive is mounted byte-identical (SHA-256 verified
against the release's `sha256sums.txt`).

## 1. Launch interface (`src/core/launch.ts`)

Arguments (parsed by the game's `src/core/LaunchOptions.lua`):

| Argument | When | Notes |
|---|---|---|
| `--game=<id>` | play | `red`, `blue`, `yellow`, `gold`, `silver`, `crystal` (`--game <id>` with a space would be taken as a game *path* by LÖVE's `boot.lua`) |
| `--slot=slotN` | play a specific slot | validated `^slot\d{1,4}$` |
| `--no-sync` | play | the game's save sync needs a server and the network |
| `--launcher` | supported by `buildLaunchPlan`, unused by the UI | RecompDeck replaces the launcher natively |

Environment variables (overlay on `os.getenv`, set before the official
`conf.lua` runs). The game reads 85 variables in v0.3.14; RecompDeck sets:

| Variable | Value | Purpose |
|---|---|---|
| `RECOMPDECK_BRIDGE` | `1` | our bridge mod's `force_enable_env` (official manifest field for exactly this case, gen1recomp `docs/modding.md`) |
| `POKEPORT_NO_DISCORD` | `1` | no Discord IPC in a browser |
| `POKEPORT_NO_THREAD` | `1` | importer/audio use their synchronous paths (no pthreads) |
| `POKEPORT_IMPORT_ROM` | `/rd/rom/<file>` | headless ROM import; the importer then boots that version |
| `POKEPORT_VERSION` | `<id>` | version hint for the headless import |
| `POKEPORT_IDLE_AFTER`, `POKEPORT_IDLE_FPS` | `20`, `15`/`20`/`30` | only when *Idle power saving* is enabled |
| `POKEPORT_CONSOLE` | `1` | only in debug mode |

Deliberately **not** set:

| Variable | Why not |
|---|---|
| `POKEPORT_TOUCH` | would register every touch twice (LÖVE's mouse twin); the OS is reported as "iOS" instead, which selects the game's own touch layout |
| `POKEPORT_SYNC_URL`, `POKEPORT_LINK_PORT`, `POKEPORT_RELAY_ADDR` | save sync and link play need sockets/HTTP from Lua, which a browser runtime does not provide |
| `POKEPORT_GAME`, `POKEPORT_SLOT`, `POKEPORT_LAUNCH`, `POKEPORT_FORCE_LAUNCHER` | equivalent to the arguments above; arguments are used |
| `POKEPORT_IDENTITY`, `POKEPORT_DATA_DIR` | the default identity `pokemon-love2d` is the save-directory contract |
| `POKEPORT_SHADERFX`, `LIBRASHADER_BRIDGE_DLL` | the native shader bridge cannot exist on the web |
| `POKEPORT_DEV`, `POKEPORT_EDITOR*`, `POKEPORT_AUTOPILOT`, `POKEPORT_DRIVER`, `POKEPORT_SPEED`, `POKEPORT_*_SHOT*`, `POKEPORT_LAUNCHER_*` | developer / test tooling |
| handheld flags (`ANBERNIC`, `MUOS`, `KNULLI`, `TRIMUI`, `PORTMASTER`, `POKEPORT_HANDHELD`, …) | other platforms |

Deep links mirror the official `gen1recomp++://launch` keys:
`scripting://run/RecompDeck?game=red&slot=2` (`requestFromQuery`).

## 2. Files and directories (save directory = LÖVE identity `pokemon-love2d`)

| Path (relative to the save dir) | Owner | RecompDeck handling |
|---|---|---|
| `saves/<ver>/slotN.lua` (+ `.bak`), legacy `save*.lua` | game | user data → mirrored, backed up, slot summaries parsed safely (`core/luaTable.ts`, `core/slots.ts`) |
| `options.lua` | game | user data (includes `options.mods` enable state) |
| `prints/`, screenshots, mod storage | game / mods | user data |
| `<ver>/data/generated/`, `<ver>/assets/generated/`, `<ver>/rom-cache.complete` | game importer | ROM-derived → per-game RDPK pack in `cache/`, never mixed with user data |
| `mods/<id>/` | user | installed by RecompDeck's validated importer; only enabled mods are materialised per session |
| `mods/recompdeck_bridge/` | RecompDeck | platform bridge mod, injected per session |
| `.rd/game.love` | RecompDeck | the official archive, mounted read-only |

## 3. Bridge mod (`runtime/mods/recompdeck_bridge`)

Uses only gen1recomp's documented process-lifecycle hooks
(gen1recomp v0.3.14 `docs/modding.md`, "Process-lifecycle hooks"):

- `core.quit_to_launcher` — vetoes the in-process Lua launcher and asks the
  native launcher to take over.
- `core.update` — skips the simulation step while a native sheet covers the
  game (pause).

It reaches the host only through `rd_host.modapi` (`quitToLauncher()`,
`paused()`); `rd_host/guard.lua` denies every other mod access to `rd_host.*`.
Outside RecompDeck the facade does not exist and the mod stays inert.

## 4. Native services the Android build adds, and their status here

The Android build extends `love.system` in `GameActivity.java` /
`wrap_System.cpp` ([apk-analysis.md](apk-analysis.md)). None of these exist in
love.js; the game checks for them before use.

| Android `love.system` extension | RecompDeck |
|---|---|
| `pickFile`, `pickFileKinds`, `createFile`, `exportImage` | native equivalents in the launcher (DocumentPicker, ShareSheet, export) |
| `getLaunchGame`, `getLaunchURI`, `updateShortcuts` | launch arguments + deep links |
| `httpDownload`, `httpPost`, `httpRequest`, `tls*` | not available to Lua; releases/runtime are downloaded natively by the host |
| `installApk`, `restartApp`, `hasBackgroundMusic` | not applicable (updates are handled by the host; restart = new session) |
| `syncHealthSteps` | not available → `Steps.available()` is false, step mods stay dormant |
| `vibrate` (standard) | → `HapticFeedback` |

## 5. Updates

The game's own updater (`src/update/*`, `--update`, `--update-mods`) needs
platform download/install hooks that do not exist here. RecompDeck checks the
GitHub releases itself (`runtime/gameManager.ts`), downloads the new `.love`,
verifies it against `sha256sums.txt` and keeps saves untouched; import caches
are rebuilt because they are bound to the game version.
