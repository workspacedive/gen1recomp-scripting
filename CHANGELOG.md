# Changelog

All notable changes to RecompDeck. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [SemVer](https://semver.org/). The version lives in
`scripting/RecompDeck/script.json` and `src/core/constants.ts` (kept equal by
a unit test).

## [1.0.0] — 2026-09-25

First release. Supported game version: gen1recomp **0.3.14**.

### Added
- Scripting project `scripting/RecompDeck` (free tier only): native launcher,
  game/slot selection, releases, ROM import, saves & backups, mods, settings,
  diagnostics, about screen; German and English.
- Web player: love.js 11.5.1 (pinned, SHA-1 + SHA-256 verified) in an
  ephemeral WKWebView loaded from `file://` with a strict CSP; chunked blob
  transport with in-page integrity checks; audio unlock; fault monitor.
- Lua bootstrap (`rd_host/*`): Lua 5.1 compatibility layer (bit, escape
  transform on every load path, 5.2 `load`, `xpcall` args, table/string/math
  extensions), C++ exception firewall for 15 LÖVE APIs, cooperative frame
  pacing, virtualised vsync, host-owned persistence, mod guard, self-test.
- Platform bridge mod using gen1recomp's official process-lifecycle hooks
  (`core.quit_to_launcher`, `core.update`), force-enabled via the official
  `force_enable_env` manifest field.
- Launch planning over the documented interface only (`--game`, `--slot`,
  `--no-sync`, `POKEPORT_*`); deep links `scripting://run/RecompDeck?game=…&slot=…`.
- Import caches (RDPK packs) bound to the game version; rolling backups;
  save export/import through validated ZIPs.
- Mod installer: central-directory ZIP scan before extraction, manifest
  validation mirroring the game's `Manifest.lua`, permission review.
- Settings: frame cap 30/60/120/display, Retina rendering, pixel-perfect
  scaling, full-screen edges, initial memory, haptics, reported OS, backups,
  update checks, language, debug; opt-in idle power saving through the game's
  official idle render governor (`POKEPORT_IDLE_AFTER`/`POKEPORT_IDLE_FPS`).
- Game archive verification against three sources: the release's
  `sha256sums.txt`, GitHub's asset digest and a pinned digest for tested
  versions (offline-verifiable import of official files).
- Tooling: `npm run check`, `tools/verify-lua.sh` (bit/escape differentials +
  upstream suites on Lua 5.1 with machine-checked expectations), headless
  Chromium harness (`tools/harness`, version-stamped local archive),
  reproducible packager (`npm run package`, `npm run release`, stale check),
  APK analyzer (`tools/apk-analysis/analyze.py`), audit scripts
  (`tools/audit/*`), CI workflow templates (`tools/ci/workflows`).
- Installable package `release/RecompDeck.scripting` and one-tap import links.
- Documentation: architecture, APK analysis, compatibility, integration,
  modding, performance, security, Scripting PRO vs. free, verification;
  `AGENT.md` and `SKILLS.md` for AI agents.

### Security
- Fail-closed WebView navigation guard (`isFileUrlInside`) covering dot
  segments, percent-encoded separators, NUL, foreign authorities and prefix
  confusion (24 attack vectors unit-tested).
- HTTPS host allowlist including redirects; bounded downloads; validated
  bridge messages; https-only external links behind a confirmation dialog.
- The game's proprietary launcher can never be requested by the launch
  planner (license term 2, unit-tested); mandatory attribution guarded by a
  unit test (license term 1).

### Fixed (during development)
- Section headers rendered literal text (`t.performance` etc.) instead of
  translations in five places; a UI lint test prevents regressions.
- `tools/verify-lua.sh` now also fails on transform compile/idempotence/
  evaluation errors instead of comparing literal output only.

### Known limitations
- FireRed/LeafGreen unsupported (Gen 3 code needs `goto`).
- No link play, save sync, network mods, step counter or background jobs
  (no sockets/threads in the browser runtime; HealthKit is PRO).
- On-device verification (WKWebView) is pending; see `docs/verification.md` §5.
