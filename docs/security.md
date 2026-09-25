# Security

RecompDeck executes third-party code (the game archive, community mods) and
handles user files (ROMs, saves, mod ZIPs). This document is the threat model
and the list of controls, each with the file that implements it.

## 1. Trust boundaries

```
 untrusted ─────────────────────────────────────────────────────────────┐
 │ network (GitHub, npm)   game archive + mods (Lua)   user files (ROM, │
 │                          │                           ZIP, backups)   │
 └──────────┬───────────────┼───────────────────────────┬──────────────┘
            │               ▼                           │
            │   WKWebView page (player.js, love.js, Lua) │
            │      strict CSP · local files only         │
            │               │ postMessage (validated)    │
            ▼               ▼                            ▼
   ┌──────────────────── Scripting host (TSX) ──────────────────────┐
   │ net.ts · bridgeSchema.ts · paths.ts · zipScan.ts · manifest.ts │
   │                  FileManager (app container only)              │
   └─────────────────────────────────────────────────────────────────┘
```

Everything that crosses into the host is validated there, even when the
sender is our own code (`player.js`, `rd_host/*`): the page runs game and mod
code that could be hostile.

## 2. Controls

### Network (`src/platform/net.ts`, `src/core/pins.ts`)
- HTTPS only; host allowlist checked for the initial URL **and every
  redirect** (`shouldAllowRedirect`): `registry.npmjs.org`, `api.github.com`,
  `github.com`, `objects.githubusercontent.com`,
  `release-assets.githubusercontent.com`, `codeload.github.com`,
  `raw.githubusercontent.com`.
- Timeouts (30 s API, 180 s downloads) and size limits (declared
  `Content-Length` and actual size, 1 MiB for text).
- **love.js runtime**: npm tarball verified by the registry SHA-1
  (`dist.shasum`) and a pinned SHA-256; the two extracted files are verified
  against pinned sizes and SHA-256 (`love.js` 335 905 B `86a993ad…`,
  `love.wasm` 4 720 510 B `8e955d3c…`).
- **Game archive**: downloaded only from the official GitHub release and
  verified against that release's own `sha256sums.txt`; stored unchanged.
- Nothing is uploaded; no analytics, no telemetry, no accounts.

### WebView (`src/player/session.ts`, `runtime/web/player.html`)
- Loaded from `file://` with read access limited to the player directory
  (`loadFile(path, allowingReadAccessTo)`), ephemeral data store.
- Navigation guard `isFileUrlInside` (`src/core/paths.ts`): only `file:///`
  URLs strictly inside the player directory; rejects dot segments (also
  percent-encoded), encoded slashes/backslashes/NUL, `file://host/…`, prefix
  confusion (`player-evil/`), malformed escapes — 24 attack vectors in
  `tests/node/core.test.mjs`. Everything else is blocked and logged; an
  https link the user tapped is offered to Safari after confirmation.
- CSP: `default-src 'none'`; scripts/styles/fonts from `'self' file:` only
  (plus `'unsafe-eval' 'wasm-unsafe-eval'`, required by Emscripten);
  `object-src`, `frame-src`, `worker-src`, `form-action`, `base-uri` = `'none'`;
  no remote origins at all.

### Bridge (`src/core/bridgeSchema.ts`)
- Every message is `{topic, data}`; unknown topics or malformed payloads are
  dropped. Strings are length-bounded (8 KiB default), file payloads ≤ 64 MiB,
  at most 2000 files per batch, all paths pass `isSafeRelPath`
  (relative, no `..`, no empty segments, no backslashes/control characters,
  ≤ 512 chars, segments ≤ 128) and are classified (`classifySavePath`) before any write.
- `openURL`: https only (`validateHttpsUrl`), then a native confirmation
  dialog showing the full URL, then `Safari.openURL`.

### Lua side (`runtime/lua/rd_host/*`)
- `guard.lua`: mods cannot `require` any `rd_host.*` module; the only
  exception is `rd_host.modapi` for the host-managed bridge mod
  (`recompdeck_bridge`). The game's own mod sandbox (deny list, per-mod
  environments) stays in force.
- `persist.lua` validates paths before streaming; the host re-validates.
- `firewall.lua` prevents VM corruption by C++ exceptions; after any
  undetected fault the page stops the runtime and refuses to persist data
  produced afterwards (no corrupted saves).

### Files (`src/core/zipScan.ts`, `src/core/manifest.ts`, `src/data/*`)
- ZIPs (mods, backup imports) are scanned from the central directory
  **before** `FileManager.unzip`: no absolute paths, `..`, backslashes, drive
  letters, control characters, duplicates, symlinks, encrypted entries,
  ZIP64, methods other than store/deflate; ≤ 4096 entries, ≤ 256 MiB total,
  ≤ 128 MiB per entry, compression ratio ≤ 200 (zip-bomb guard).
- Mod manifests are validated (id pattern, semver, API 1/2, categories,
  games, permissions) and every declared permission is shown before enabling.
- ROMs: size pre-filter + native SHA-1 against the 11 official hashes; stored
  only in `roms/`, never uploaded, never written into the game archive. The
  ROM-derived import cache stays on the device.
- All paths are joined under the app's Documents container
  (`src/platform/fs.ts`); file names from users are sanitised
  (`safeFileName`).

### Logging (`src/platform/log.ts`)
- Paths and messages only, never file contents, tokens or ROM data.

## 3. Scripting free tier and privacy

All APIs are from the free tier ([scripting-pro-vs-free.md](scripting-pro-vs-free.md)).
RecompDeck requests no permissions (no location, contacts, photos, health,
Bluetooth, microphone). The Android build's permissions
(`BLUETOOTH`, `ACTIVITY_RECOGNITION`, `REQUEST_INSTALL_PACKAGES`, …; see
[apk-analysis.md](apk-analysis.md)) have no counterpart here.

## 4. Known limits

- WKWebView requires `'unsafe-eval'`/`'wasm-unsafe-eval'` for Emscripten; the
  CSP still blocks every remote origin, so injected code cannot exfiltrate.
- Mods are Lua code running inside the game with the game's privileges; the
  game's sandbox plus `guard.lua` limit them, but a malicious mod can still
  corrupt its own game state. Only install mods you trust; the permission
  sheet shows what a mod declares.
- The host cannot verify the *content* of community mods (no signatures
  exist upstream).

## 5. Reporting

Open a GitHub issue without exploit details and ask for a private channel.
