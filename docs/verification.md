# Verification

What has been verified, how, at which evidence level, and what can only be
verified on an iPhone/iPad. Numbers are copied from command output; rerun the
commands to reproduce them (AGENT.md §5).

## 1. Evidence levels

| Level | Meaning |
|---|---|
| **V0** | static: documentation, declarations (`.d.ts`), source audit |
| **V1** | unit tests of pure modules (Node) |
| **V2** | differential / upstream test suites on the target VM (PUC Lua 5.1) |
| **V3** | end-to-end: real game archive on love.js in headless Chromium through the exact RecompDeck page + Lua bootstrap |
| **V4** | on device inside the Scripting app (WKWebView, JavaScriptCore) |

V0–V3 were done in the development sandbox; V4 needs a device (§5).

## 2. Results

| Area | Level | Command | Result |
|---|---|---|---|
| Scripting typings pinned + verified | V0 | `npm run fetch-types` | `global.d.ts` 710 261 B, `scripting.d.ts` 456 732 B, SHA-256 match (Honye/scripting-scripts @41f3d238) |
| Host code vs. Scripting API | V0 | `npm run typecheck` | 0 errors |
| Free tier only | V0 | skill S1, [scripting-pro-vs-free.md](scripting-pro-vs-free.md) | every used API/page free |
| Pure host logic | V1 | `npm test` | 18/18 tests (ZIP policy, manifests, RDPK, paths incl. 24 WebView-guard attack vectors, bridge schema, launch plans, settings, Lua table parser on a real save sample, checksum cross-check, UI text lint) |
| Our Lua parses on 5.1 | V0 | `npm run lint:lua` | 20 files, 0 problems |
| `bit` library | V2 | `tools/verify-lua.sh` | identical to LuaJIT on 21 700 output lines |
| Escape transform | V2 | `tools/verify-lua.sh` | 44 files / 8592 literals / 322 rewrites identical; shipped archive 27 files / 2921 literals / 149 rewrites; idempotent; compiles (2 documented non-game exceptions) |
| Upstream engine tier | V2 | `tools/verify-lua.sh` | LuaJIT 680/681, Lua 5.1 + compat 667/681; extra failures == expected list (13, Gen 3/goto) |
| Upstream gen2 / modkit / tooling | V2 | `tools/verify-lua.sh` | 149/149, 37/37, 137/137 on both VMs |
| Game archive syntax | V0 | skill S2 | 1062/1068 compile on 5.1; 6 Gen 3 importer files (`goto`, shebang) |
| Boot, http transport | V3 | harness | official launcher reached, no errors |
| Boot, file:// chunk transport (iOS path) | V3 | harness `--transport chunks --selftest` | ready; self-test 16/16 probes in both stages (conf, main); firewall prevented 23 `filesystem.read` exceptions (19 from the game, 4 deliberate self-test probes); 3 chunks / 6 escape rewrites until ready; WebGL 1.0 context; persistence batch delivered |
| Persistence round trip | V3 | harness `--save-pack` | files written in run 1 present in run 2 |
| ROM verification | V3 | harness with a fake ROM | rejected by SHA-1 |
| Frame pacing | V3 | harness | work per frame 0.8–1.6 ms in every run; 60 fps at DPR 1, 30–60 fps at DPR 2 depending on sandbox load (software-WebGL fill rate, outside the frame callback); idle import screen 15 fps via skipped rAF (no busy-wait) — [performance.md](performance.md) §2 |
| Packaging | V1 | `npm run package` | reproducible `dist/RecompDeck.scripting` (identical SHA-256 across runs) + `.sha256` |
| APK | V0 | source + GitHub metadata | [apk-analysis.md](apk-analysis.md); binary level via `tools/apk-analysis/analyze.py` |

## 3. E2E

```bash
npm run harness:setup    # Chromium, pinned love.js, local game archive
npm run harness -- --game .cache/game-0.3.14.love --lovejs .cache/lovejs/compat \
  --transport chunks --duration 30 --shots 12,30 --selftest --out .cache/runs/e2e
```

`report.json` contains every host message, console line, stats sample and
the self-test results; the screenshots show the official launcher in its
portrait mobile layout (game selector, MODS/FIND/ONLINE/SKINS/IMPORT tabs,
"Red — ROM REQUIRED" with the *Import ROM* button, save section). Expected:
`ready` once, no `error`/`engineFault`, self-test all `ok`.

## 4. Deviations of the sandbox from the real setup

1. **Game archive bytes.** Release assets cannot be downloaded in the
   sandbox, so the E2E runs used a `.love` built locally from tag `v0.3.14`
   with upstream's file set and version stamp (`npm run harness:setup`;
   24 109 848 B, SHA-256 `46f04cd3…`, `engine = "0.3.14"`) instead of the
   official asset (24 110 241 B, `b425a286…`). Same sources; the remaining
   393-byte difference is ZIP metadata/order. (Runs before 2026-09-25 used an
   unstamped build, `engine = "0.0.0-dev"`; an A/B run showed identical
   behaviour.)
2. **Browser.** Headless Chromium with software WebGL (SwiftShader), not
   WebKit. WebKit-specific behaviour is covered by V4.
3. **No ROM.** No legally owned ROM was available, so no in-game session
   (overworld, battles, Gen 2 import, shader presets) could be run.
4. **APK binary** not downloadable → analysis levels A+B, tooling for C.

## 5. Device checklist (V4)

Record results (device, iOS version, Scripting version) in this section.

| # | Step | Expected |
|---|---|---|
| 1 | Import via the link in the README | project "RecompDeck" appears in Scripting |
| 2 | Home → install runtime | "Verified love.js / love.wasm"; log has **no** "native inflate failed" (confirms `CompressionAlgorithm` handling) |
| 3 | Install game 0.3.14 | Diagnostics shows `release-checksum` |
| 4 | Import a ROM (Red) | accepted by SHA-1; headless import runs; afterwards Home shows "cache ready" |
| 5 | Play | game at 60 fps (Diagnostics), touch controls, sound after the first tap (also with the mute switch on), haptics on rumble |
| 6 | Menu → pause / resume / back to launcher | simulation pauses; returning saves |
| 7 | Save in game, close Scripting, reopen, continue | save present; slot summary shown |
| 8 | Backups: manual, export ZIP, import ZIP | round trip works; invalid ZIP rejected |
| 9 | Mods: import a sample mod ZIP | permission sheet; mod active in game |
| 10 | Background app during play, return | no data loss; audio resumes |
| 11 | Deep link `scripting://run/RecompDeck?game=red&slot=1` | starts Red, slot 1 |
| 12 | Settings: frame cap 30/120, idle power saving 20 fps | Diagnostics fps follows |
| 13 | Gold/Silver/Crystal import | as upstream Phase 1 |
| 14 | Game controller (MFi/Xbox/PlayStation) | works if WKWebView exposes the Gamepad API (unknown) |
| 15 | Diagnostics log | WebCrypto verification active or "verified by the host" (both fine) |
| 16 | Older device (3 GB RAM) with 192 MB memory | no WebView crash; otherwise choose 128 MB |

## 6. Documentation vs. declarations

See [scripting-pro-vs-free.md](scripting-pro-vs-free.md) §5
(`CompressionAlgorithm` enum vs. string, `evaluateJavaScript` + `await` in the
gunzip fallback, `stopAcessingSecurityScopedResources` spelling). Checklist
step 2 settles the first point on a device.
