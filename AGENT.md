# AGENT.md — Operating manual for AI coding agents

This file is the binding instruction set for any LLM/agent (Codex, Claude Code,
Cursor, Arena agents, …) working in this repository. Read it completely before
changing anything. `SKILLS.md` contains the step-by-step procedures referenced
below; use the matching skill for every task it covers.

---

## 1. What this project is

**RecompDeck** is an unofficial iOS frontend for the
[gen1recomp](https://github.com/bryanthaboi/gen1recomp) LÖVE game, built as a
project for the **Scripting** iOS app (<https://scriptingapp.github.io>). It runs
the **unmodified, official** gen1recomp game archive (`gen1recomp-<ver>.love`,
downloaded by the user from the official GitHub release) on **love.js**
(LÖVE 11.5 compiled to WebAssembly) inside a WKWebView, and wraps it in a native
SwiftUI-style launcher written in TSX.

```
┌─ scripting/RecompDeck (TSX, runs in Scripting)  ─ native launcher, ROM/mod/save
│   managers, downloads + integrity, settings, WebView host, bridge endpoint
├─ scripting/RecompDeck/runtime/web (JS, WKWebView) ─ love.js loader, bridge,
│   persistence routing, exception monitor, cooperative frame pacing
└─ scripting/RecompDeck/runtime/lua (Lua 5.1, inside love.js) ─ compat layer,
    C++-exception firewall, platform shims, persistence hooks, boot
      └─ official gen1recomp archive (mounted read-only, byte-identical)
```

Authoritative design documents: `docs/architecture.md`, `docs/compatibility.md`,
`docs/security.md`, `docs/performance.md`, `docs/apk-analysis.md`.

## 2. Non-negotiable constraints

1. **Scripting free tier only.** Never use an API that requires *Scripting PRO*.
   The authoritative list is the `"pro": true` flag in the official
   documentation index (`doc.json`), summarised in
   `docs/scripting-pro-vs-free.md`. Examples that are **forbidden**: `SQLite`,
   `Archive` (use `FileManager.zip/unzip`), `HttpServer`, `BackgroundKeeper`,
   `Haptics` (use `HapticFeedback`), `Bluetooth`, `Assistant`, `WebScraper`,
   `Spotlight`, `ControlWidget`, `CustomKeyboard`, `Health`, `HomeKit`,
   `FontPicker`, `Translation`, `NaturalLanguage`, `LanguageModelSession`,
   PiP view modifiers, `Intent.continueInForeground`, `SnippetIntent`.
   Run skill **S1** before introducing any Scripting API.
2. **gen1recomp license (GPLv3 + Additional Terms).**
   - The credit line *"Based on the Pokemon Gen 1 Recompilation Project by
     BOIS CLUB GAMES, LLC (https://github.com/bryanthaboi/gen1recomp)"* must stay
     visible in the README, in the launcher's main screen, in the About screen
     and in the player loading screen.
   - Never commit, bundle, patch or redistribute any file of the game archive,
     and never copy or modify the proprietary launcher files listed in the
     gen1recomp `LICENSE.MD` (term 2). The archive is downloaded by the user
     from the official release and mounted unchanged; its SHA-256 is verified.
   - Do not use "gen1recomp", "G1R", "Pokémon" or other marks as the product
     name; they may appear only descriptively/for credit.
   - Never add ROM data, extracted game content or save files to the repo.
3. **love.js rules (verified, see `docs/compatibility.md`).**
   - PUC **Lua 5.1**: our own Lua must not use `goto`, `\x`/`\u{}`/`\z`
     escapes, integer division or other 5.2+ syntax. Check with `luac5.1 -p`.
   - **C++ exceptions are fatal**: love.js has no landing pads in LÖVE's Lua
     wrappers; a `love::Exception` corrupts the Lua VM even under `pcall`. Any
     new code path that can make a LÖVE API throw needs a firewall rule
     (skill **S4**).
   - **Never block the browser main thread** (no busy-waits, no synchronous
     loops waiting for time). Frame pacing is cooperative (`frame.wake`).
   - The real swap interval stays 1 (rAF); the game's vsync wishes are virtual.
4. **Security.** Treat everything coming from the web page, the game, mods,
   downloads and user files as untrusted: validate paths (no `..`, no absolute
   paths), sizes, types, schemas; verify downloads by SHA-256/SHA-1 against
   pinned or official checksums; keep the WebView on local content only
   (`shouldAllowRequest`), confirm external links with the user, never log or
   store secrets. See `docs/security.md`.
5. **Performance.** Heavy byte work belongs to native APIs (`Crypto`, `Data`,
   `FileManager`) or to the WebView (JIT), never to per-byte loops in the
   Scripting JS context. Cache derived artifacts (chunked blobs, packs) keyed
   by content hash.

## 3. Repository map

| Path | Purpose |
|---|---|
| `scripting/RecompDeck/` | The Scripting project (import this folder into the app) |
| `scripting/RecompDeck/script.json` | Scripting metadata (`name` = folder name) |
| `scripting/RecompDeck/index.tsx` | Main entry (launcher UI) |
| `scripting/RecompDeck/src/` | Host modules (TS/TSX), pure logic kept UI-free |
| `scripting/RecompDeck/runtime/lua/` | Lua bootstrap copied into the love.js FS |
| `scripting/RecompDeck/runtime/web/` | WebView player (HTML/CSS/JS) |
| `scripting/RecompDeck/runtime/mods/` | Host-managed platform bridge mod |
| `tests/` | Lua differential tests, Node unit tests |
| `tools/` | Harness (headless Chromium), packers, type-check helpers |
| `docs/` | Architecture, analyses, verification reports |

## 4. Workflow for every change

1. Understand: read the files you touch and their direct dependencies.
2. Pick the matching skill(s) from `SKILLS.md` and follow them exactly.
3. Make the smallest correct change; keep pure logic in UI-free modules.
4. Verify with the strongest evidence available (section 5) and record what
   you ran. Never describe a weaker check as a stronger one.
5. Update the affected docs in the same change (`docs/`, README, CHANGELOG).
6. Commit with a descriptive message on the working branch; never force-push.

## 5. Verification commands and evidence levels

| Check | Command | Proves |
|---|---|---|
| Lua syntax (5.1) | `find scripting -name '*.lua' -exec luac5.1 -p {} +` | our Lua parses on love.js |
| bit library | `luajit tests/lua/bit_differential.lua native > a; lua5.1 tests/lua/bit_differential.lua rd_host > b; cmp a b` | bit-exact vs LuaJIT |
| escape transform | `tests/lua/lua51src_literals.lua` (see file header) | literals identical |
| upstream tiers | `tools/lua51compat tests/run_engine.lua` (in a gen1recomp checkout) | game logic on Lua 5.1 + compat |
| TS/TSX types | `npm run typecheck` | host code matches Scripting `.d.ts` |
| unit tests | `npm test` | pure host logic |
| E2E (browser) | `node tools/harness/run-player.mjs …` | real game on love.js in Chromium |
| Device | manual, see `docs/verification.md` | WKWebView/iOS behaviour |

Chromium is not WKWebView: browser results never prove iOS behaviour. State the
remaining on-device steps explicitly.

## 6. Coding conventions

- TypeScript strict; no `any` in exported APIs; 2-space indent, no semicolons
  in TS/TSX (Scripting community convention), single quotes.
- Import UI components/hooks only from `"scripting"`; globals (`FileManager`,
  `Data`, `Crypto`, `Script`, `Navigation`, …) are ambient — never import them.
- JSX factory is `createElement`/`Fragment` (see `tsconfig.json`).
- Lua: `local` everything, no globals except documented shims, SPDX header,
  5.1 syntax only.
- Every file carries `SPDX-License-Identifier: GPL-3.0-or-later`.
- User-facing strings: German and English (`src/i18n.ts`).

## 7. When unsure

Prefer the official documentation (`https://scriptingapp.github.io/llms.txt`,
the bundled `doc.json`) and the synced `.d.ts` over memory. If documentation and
declarations disagree, follow the declarations for compile-time shape and the
documentation for behaviour, and note the discrepancy in `docs/verification.md`.
