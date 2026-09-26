# Component update architecture

Status: design and partially implemented control plane, 2026-09-26  
Applies to Scripting project 0.3.0 and later.

## Evidence vocabulary

- **VERIFIZIERT** — demonstrated by official documentation/source or a reproducible repository test.
- **TEILWEISE VERIFIZIERT** — an important part is demonstrated, but a required device/runtime property is not.
- **NICHT VERIFIZIERT** — not demonstrated.
- **TECHNISCH UNBEKANNT** — the available host contract does not settle the question.
- **VORAUSSETZUNG** — mandatory before activation.
- **NUR MIT HOST-UNTERSTÜTZUNG** — cannot be provided safely by this Scripting project alone.
- **EXPERIMENTELL** — candidate path, not a supported runtime claim.
- **BENCHMARK ERFORDERLICH** — requires measurement on supported real devices.

## What “like an iOS app update” means here

This product has five independently owned layers. Treating all five as one downloadable “Core” would weaken rollback and risk user data.

| Layer | Owner | Update experience | Current status |
|---|---|---|---|
| Scripting iOS host app | Scripting | App Store/TestFlight, outside this project | **NUR MIT HOST-UNTERSTÜTZUNG** |
| Gen1Recomp Scripting project | this repository | import a new `.scripting` package; migrations run on next open | **VERIFIZIERT** packaging path |
| love.js runtime bundle | Core store | stage a complete matched JS/WASM/player/license set, verify, test, restart, roll back | **TEILWEISE VERIFIZIERT** design; activation disabled |
| Gen1Recomp `.love` payload | payload store | check, stage, hash, host/shell gate, restart, crash guard, roll back | **VERIFIZIERT** upstream model; **NICHT VERIFIZIERT** in Scripting WebView |
| Mods | immutable mod store + activation profile | inspect ZIP, validate manifest, store by identity; enable per game only after runtime gate | local storage **VERIFIZIERT**; runtime activation **NICHT VERIFIZIERT** |

The UI may present these through one Settings screen, but their trust roots, compatibility gates and rollback units remain separate.

## Upstream findings

### Gen1Recomp payload updater

**VERIFIZIERT** against official tag `v0.3.18`, commit `b83f805a7c7b6043370b783ea7a4b65fd8c93ef4`:

- `src/update/Boot.lua` probes candidate `.love` files without requiring their modules, selects only a strictly newer engine, and gates on `payloadHost` and `minShell`.
- The selected payload is mounted over the bundled source. The bundled source remains the fallback; no base installation is rewritten.
- `updates/pending.txt` is written immediately before handoff. If it remains after a crash, the named payload is removed at next boot before selection.
- Download occurs to a `.part` file. `sha256sums.txt` is parsed and SHA-256 is checked before rename into the update directory.
- Activation is restart-based, not an in-session hot swap.
- A payload requiring a newer native contract becomes `needs_full`; it is not forced onto an incompatible shell.
- `love.run` cannot be replaced after the existing loop has started. Such a change requires a shell-contract bump.

The audited baseline release `v0.3.18` publishes `gen1recomp-0.3.18.love` (24,895,147 bytes), GitHub digest/SHA-256 `853a539f64f892248846d4fd7ec31837b8450b573cdb3658b23d64ae08d5f732`, and `sha256sums.txt`.

The latest release rechecked on 2026-09-26 is `v0.3.20`, commit `64dd9cb3a377b398b6132d223a121878f68b4b07`. Its `.love` asset is 24,908,860 bytes with GitHub digest `c0da7035afb110cb9b45556a44c855bd27c96903737128fa8114209b9eb7f0a5`; `sha256sums.txt` is present. `src/update`, `src/mods`, and `docs/updater.md` have no changes from `v0.3.18` to `v0.3.20`, so the protocol analysis remains applicable. The sandbox's direct asset transfer ended in an SSL/EOF failure, therefore the 0.3.20 digest is **VERIFIZIERT as GitHub release metadata** but not independently recomputed from downloaded bytes here. The 0.3.0 app intentionally keeps 0.3.18 as its audited pin and reports 0.3.20 as available metadata; it does not activate it.

This is the semantic model the Scripting adapter must preserve. It must not invent a second meaning for `payloadHost`, `minShell`, payload version, or mod API version.

### love.js

**VERIFIZIERT** against official `2dengine/love.js` commit `9355186de22db13bd88bf2a0db75d2925647d036`:

- the inspected runtime identifies itself as LÖVE 11.5;
- the runnable set includes version-matched `love.js`, `love.wasm`, `player.js` and licensing material;
- the player accepts `.love` packages and caches package data in IndexedDB;
- browser audio requires user interaction in relevant environments;
- the project documents WebGL/browser limitations and server/header assumptions.

Pinned repository measurements:

- `11.5/love.js`: `34b300f06ecb44d92edb1183c11a38c1cc324ba10a9f7af96b8efa1d1df15147`
- `11.5/love.wasm`: `304f195f36d163f3bb2127e7c232fd1fd0791ee2ab61ba003d47096003b53bf1`

A JS file and WASM file are not updated independently. They are one runtime release unit with the adapter, player and licenses. Mixing files from two builds is rejected by design.

Whether `WebViewController.loadFile` provides everything this love.js build expects for local WASM, workers, headers, WebGL, audio and persistent VFS is **TECHNISCH UNBEKANNT**. A local JavaScript capability probe is not proof of a love.js boot.

### Mods

**VERIFIZIERT** in official `src/mods/Manifest.lua` and `src/mods/LauncherMods.lua`:

- manifest v2 is a strict superset of v1;
- `id`, `version`, `api`, entry path, dependency/conflict ranges, target games, profiles and permissions are validated by the original loader;
- an archive may contain `manifest.json` at its root or in one single top-level folder;
- index metadata identifies where a release ZIP is found, but the archive manifest remains authoritative;
- replacement preserves user-supplied `baseroms` and uses a recovery location on failure;
- mod activation and load order remain original Gen1Recomp responsibilities.

The Scripting shell therefore only validates the safe transport/storage subset before runtime exists. It stores packages immutably and does not claim that a stored package is enabled. Full manifest semantics must ultimately be delegated to the original Gen1Recomp loader behind the runtime adapter.

## Trust model

SHA-256 answers “are these the bytes named by this digest?” It does not by itself answer “who authorized this new digest?” `sha256sums.txt` and a release asset fetched from the same compromised account share one failure domain.

Safe channels are therefore:

1. **Pinned project release:** a `.scripting` update carries reviewed component hashes in source. **VERIFIZIERT**.
2. **Signed remote catalog:** a canonical manifest is signed by an offline release key embedded as a public trust anchor. Signature verification, key rotation and revocation are mandatory. **VORAUSSETZUNG** for unattended network activation; suitable asymmetric verification in the documented Scripting contract is currently **TECHNISCH UNBEKANNT**.
3. **User-selected local package:** accept only when its digest is already pinned by channel 1 or a valid channel-2 signature. Otherwise retain in quarantine and show identity, never activate automatically.

The 0.3.0 network action reads release metadata only. It does not download or activate code.

## Component manifest model

A future signed catalog uses canonical UTF-8 JSON with duplicate keys rejected and a detached signature over the exact bytes. Each component entry contains:

```json
{
  "schemaVersion": 1,
  "component": "gen1recomp-payload",
  "version": "0.3.18",
  "payloadHost": "love-web-scripting",
  "minShell": 1,
  "runtime": { "love": "11.5", "bundle": "lovejs-11.5-r1" },
  "files": [{ "path": "game.love", "bytes": 24895147, "sha256": "…" }],
  "healthCheck": "gen1recomp-boot-v1"
}
```

Rules:

- no unlisted files in an activated component root;
- exact byte length and SHA-256 for every file;
- HTTPS source allowlist and redirect allowlist;
- monotonic version unless the user explicitly selects a signed rollback;
- `payloadHost` equality, `minShell <= shell`, supported LÖVE version, schema and disk-space gates;
- component roots contain no saves, games, user imports or mod-owned files.

The Scripting web host should use a distinct `payloadHost`, not upstream’s ordinary `love`, if it requires browser/bridge-specific Lua. Reusing `love` while silently requiring extra bridges would defeat the upstream host-family gate.

## State machine

`idle → checking → available → downloading.part → hash-verified → compatibility-verified → staged → health-checking → ready → activating-on-restart → active`

Failure edges end in `rejected` or `rolled-back`, with an append-only diagnostic event. There is no in-session code hot swap.

Activation protocol:

1. recover any old transaction journal;
2. download/copy into `Transactions`, never directly into `Core/current`;
3. enforce size limits while streaming where supported;
4. verify manifest authorization, then each length and hash;
5. parse metadata without executing the candidate;
6. enforce host/shell/runtime/storage-schema compatibility;
7. publish the immutable version directory by rename;
8. run an isolated health check with no access to user saves;
9. write a pending-boot marker naming the candidate and previous version;
10. atomically replace the small active-pointer record;
11. restart; clear pending only after a defined healthy milestone;
12. if the next launch sees the marker, restore the previous pointer and quarantine the candidate.

At least one previously healthy Core remains until a later healthy launch and retention cleanup. Cache eviction never touches rollback or user-owned state.

## Mandatory runtime health gates

All are **VORAUSSETZUNG** and currently incomplete:

- exact love.js JS/WASM/player files load through local URLs;
- the real Gen1Recomp `.love` reaches a deterministic boot milestone;
- WebGL draws and reads back a real frame;
- audio starts after an explicit gesture and recovers across interruption;
- keyboard/touch/controller adapter semantics are demonstrated;
- VFS writes survive close/reopen and an interrupted write recovers;
- background/foreground and memory-pressure behavior is safe;
- pending-boot crash recovery rolls back;
- canonical game import reaches the expected game path;
- representative-device latency, memory and sustained frame behavior pass measured budgets (**BENCHMARK ERFORDERLICH**).

Until then `APP.runtimeEnabled` remains `false`, update activation remains disabled, and the product must say “stored” or “candidate”, never “playable”.

## User-data invariants

- Games: `Documents/Gen1Recomp/Library/content/<sha256>/`
- Saves: `Documents/Gen1Recomp/Saves/`
- Mods: `Documents/Gen1Recomp/Mods/`
- Mutable Core versions: `Documents/Gen1Recomp/Cores/`
- Transactions: `Documents/Gen1Recomp/Transactions/`
- Diagnostics: `Documents/Gen1Recomp/Diagnostics/`
- Cache: expendable only

No Core update may recursively replace `Documents/Gen1Recomp`. Migrations must be versioned, journaled, verified, backward-safe or backed up, and resumed/rolled back after interruption.

## Implemented in 0.3.x

- a four-tab shell: Games, Mods, Diagnostics and Settings;
- explicit pinned component inventory;
- user-triggered, metadata-only Gen1Recomp release check with response-size and shape limits;
- pre-extraction ZIP central-directory validation for local mods, cross-check with documented `Archive.entries()`, and per-entry extraction to explicit safe destinations: traversal, absolute paths, backslashes, malformed UTF-8, duplicate/case-colliding paths, encryption, unsupported methods, ZIP64, multi-disk archives, symlinks, per-entry/total/count limits, and packaged `baseroms` user inputs;
- immutable mod storage by `id/version/SHA-256`, atomic index replacement with backup, interrupted staging cleanup, and removal that publishes the index before deleting payload bytes;
- no mod activation and no network code activation;
- since 0.3.1, up to 32,768 archive entries (instead of the too-low initial 4,096), a 200:1 expansion-ratio ceiling, and one shared in-memory read for hashing plus preflight. The higher limit is covered by an asset-heavy regression test and retains all path/type/size gates.
