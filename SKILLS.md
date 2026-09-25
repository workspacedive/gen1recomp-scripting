# SKILLS.md — Reusable procedures for agents

Each skill has a trigger, inputs, exact steps and a definition of done. Agents
must use the skill whose trigger matches the task (see `AGENT.md` §4) and must
not skip steps. Skills reference each other by ID.

External base skill: the official
[`scripting-app-development`](https://github.com/ScriptingApp/scripting-app-development)
skill (verified at commit `2991c41f42be9e50d3080c5af34315e68ebb3d86`). Its
mandatory documentation workflow is embedded in S1; its lifecycle, validation
and safety rules apply to every Scripting change.

---

## S1 — Scripting API verification (free tier)

**Trigger:** adding or changing any use of a Scripting API, view or modifier.

1. Locate the API in the official docs index
   (`https://scriptingapp.github.io/llms.txt`; offline copy: the
   "Scripting Documentation" `doc.json` shipped in
   `ScriptingApp/ScriptingApp.github.io/scripting/App Store/`). Read the full
   page, not a summary.
2. **PRO check:** the entry and all its parents must not carry `"pro": true`
   in `doc.json`, and the page text must not say "requires Scripting PRO".
   If it does, choose a free alternative (see `docs/scripting-pro-vs-free.md`).
   To regenerate the full list: unzip both `Scripting Documentation.zip`
   files and run `python3 tools/audit/extract_pro.py <appstore dir> <testflight dir>`.
3. Confirm the exact TypeScript shape in the synced declarations
   (`types/scripting/global.d.ts`, `types/scripting/scripting.d.ts`, fetched by
   `npm run fetch-types`): import vs. global, parameters, return type, async.
4. Implement behind a narrow helper in `src/` (never scatter raw calls in UI).
5. Run `npm run typecheck`.
6. Record the API and doc page in `docs/scripting-pro-vs-free.md` (table
   "APIs used by RecompDeck").

**Done when:** typecheck passes, the API is listed as free with its doc page.

## S2 — Lua 5.1 compatibility audit of an upstream release

**Trigger:** a new gen1recomp release should be supported.

1. Build or download the release archive; verify SHA-256 against the
   release's `sha256sums.txt` (skill S6).
2. Unzip to a temp dir and run
   `python3 tools/audit/lua51_syntax_check.py <dir> report.json`
   (compiles every file with PUC Lua 5.1 and LuaJIT 2.1).
3. Run `python3 tools/audit/lua_escape_scan.py <dir> escapes.json`; make sure
   no proprietary launcher file needs a rewrite.
4. Run `python3 tools/audit/require_graph.py <dir>` and confirm only Gen 3
   modules depend on non-5.1 files.
5. Run skill S3.
6. Update `docs/compatibility.md` (tables + numbers) and the supported-version
   pin in `src/core/pins.ts`.

**Done when:** all non-Gen-3 files compile on 5.1 and S3 shows no new
failures beyond the documented ones.

## S3 — Upstream test tiers on Lua 5.1 + compat layer

**Trigger:** changes to `runtime/lua/rd_host/compat.lua`, `bit.lua`,
`lua51src.lua`, or S2.

1. Run `tools/verify-lua.sh <gen1recomp checkout of the target tag>`. It
   runs, in order: the `bit` differential (LuaJIT native vs `rd_host/bit.lua`
   on Lua 5.1), the escape-transform literal differential over every upstream
   file with 5.2+/LuaJIT escapes, and the tiers `run_engine`, `run_gen2`,
   `run_modkit`, `modkit_tests` on LuaJIT (baseline) and on
   `tools/lua51compat` (Lua 5.1 + compat). Logs go to `.cache/verify/`.
2. The script fails unless gen2/modkit/modkit tooling fully pass on both VMs
   and the engine tier's extra failures equal
   `tests/lua/expected_compat_failures.txt` exactly.
3. A new failure must be explained (Gen 3 `goto`, harness artefact) or
   fixed. Only a proven Gen 3/goto case may be added to the expected list,
   with the reason in `docs/compatibility.md`; a test that starts passing
   must be removed from the list.
4. Update `docs/verification.md` with the numbers the script printed.

**Done when:** gen2, modkit and modkit tooling match the baseline exactly and
engine differences are fully explained.

## S4 — Firewall rule for a throwing LÖVE API

**Trigger:** a LÖVE function reached by the game (or a mod) can throw a
`love::Exception` on an expected failure (missing file, bad format, limits).

1. Find the C++ wrapper in LÖVE 11.5 (`wrap_*.cpp`) and note every throw path
   and the native error message/return convention.
2. Add a Lua pre-check in `runtime/lua/rd_host/firewall.lua` that detects the
   failure *before* entering C++ and reproduces LÖVE's result exactly
   (`nil, msg` return or `error(msg, level)`).
3. Count it with `prevented("<module.function>")`.
4. Add a probe to a harness test game and run skill S5; the probe must return
   the native result and `engineFault` must not appear.
5. Document the rule in `docs/compatibility.md` (firewall table).

**Done when:** the probe behaves like native LÖVE in the harness.

## S5 — End-to-end run in headless Chromium

**Trigger:** any change in `runtime/` or the player protocol.

1. `npm run harness:setup` (installs puppeteer-core + @sparticuz/chromium into
   `.cache/browser`, downloads the pinned love.js build into `.cache/lovejs`).
2. `node tools/harness/run-player.mjs --game <game.love> --lovejs .cache/lovejs/compat --out .cache/run --duration 40 --shots 10,40`
   (options: `--selftest`, `--arg=--game=red`, `--env K=V`, `--save-pack`,
   `--file dest:path:local`, `--viewport 390x844@3`, `--transport chunks`
   to load the page from `file://` with chunked `<script>` blobs exactly like
   the iOS host, `--tap x,y@sec`, `--key Enter@sec`, `--fps-cap`).
3. Inspect `report.json` (topics, errors, `engineFault`, `perf`, `stats`) and
   the screenshots.
4. For persistence changes run the two-boot round trip (see
   `docs/verification.md` §E2E).

**Done when:** `ready` is reached, no `error`/`engineFault`, screenshots show
the expected screen, and results are written to `docs/verification.md`.

## S6 — Pin / update downloadable artifacts

**Trigger:** new love.js build or new gen1recomp release.

1. Download from the official source only (npm registry tarball for love.js,
   GitHub release for the game).
2. Verify the publisher checksum (npm `dist.integrity`, release
   `sha256sums.txt`), then compute SHA-256 of the extracted files.
3. Update `src/core/pins.ts` (URL, size, SHA-256) and `docs/security.md`.
4. Run S5 with the new artifact.

**Done when:** pins updated, S5 passes.

## S7 — Mod package security review

**Trigger:** changing the mod importer or reviewing a mod.

1. The ZIP central directory is parsed by `src/core/zipScan.ts`
   (`DEFAULT_ZIP_POLICY`) before any extraction: reject absolute paths, `..`,
   backslashes, drive letters, control characters, duplicate names, symlinks,
   encrypted entries, methods other than store/deflate, ZIP64, > 4096 entries,
   > 256 MiB total or > 128 MiB per entry uncompressed, compression ratio > 200.
2. `manifest.json` is validated by `src/core/manifest.ts` (id pattern, semver,
   api 1|2, known categories, `games`, permissions).
3. Permissions (`network`, `filesystem`, `engine_internals`, `steps`,
   `background`, `compute`) are shown to the user before enabling.
4. Run `npm test` (zipScan + manifest fixtures).

**Done when:** tests pass and the permission UI lists every declared
permission.

## S8 — Release packaging

**Trigger:** preparing a release of RecompDeck.

1. Bump `version` in `scripting/RecompDeck/script.json` **and** `APP_VERSION`
   in `src/core/constants.ts` (a unit test enforces equality); update
   `CHANGELOG.md`.
2. `npm run release` → `release/RecompDeck.scripting` (+ `.sha256`), the
   committed package the README import links point at (reproducible ZIP with
   the project folder at the top level, directory entries included).
   `npm run package` builds the same into `dist/` for ad-hoc use.
3. `npm run check` (typecheck + unit tests + Lua syntax + `check:release`,
   which fails if the committed package is stale).
4. After pushing, verify the link target: the blob SHA from
   `gh api "repos/<owner>/<repo>/contents/release/RecompDeck.scripting?ref=<branch>" --jq .sha`
   must equal `git hash-object release/RecompDeck.scripting`. Import links are
   `https://scripting.fun/import_scripts?urls=` + URL-encoded JSON array of
   `https://github.com/<owner>/<repo>/raw/refs/heads/<branch>/release/RecompDeck.scripting`
   (the fully qualified `refs/heads/` form also works for branch names with `/`).

## S9 — Documentation sync

**Trigger:** any behavioural change.

Update the affected sections of `README.md`, `docs/*.md` and `CHANGELOG.md` in
the same commit. Numbers in docs must come from a command you actually ran.

## S10 — APK analysis refresh

**Trigger:** a new Android release should be analysed.

1. Reconstruct from source at the release tag: `mobile/android` manifest,
   gradle properties, `scripts/build_android.sh` branding/permissions, native
   `love.system` extensions (`wrap_System.cpp`, `GameActivity.java`), embedded
   `game.love` contents (`scripts/pack_love.sh`).
2. Verify the real binary: either enable `tools/ci/workflows/apk-analysis.yml`
   (see `tools/ci/README.md`; workflow_dispatch, input `version`) or run
   `python3 tools/apk-analysis/analyze.py <apk> <out> --love <official .love>`
   locally with Android build-tools on `PATH` (hash, `aapt2 dump badging`,
   decoded manifest, `apksigner verify --print-certs`, native libraries,
   embedded `game.love` file-by-file diff against the official `.love`).
3. Update `docs/apk-analysis.md`.
