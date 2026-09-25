# Scripting PRO vs. free tier

RecompDeck must run on the **free** tier of the Scripting app (hard
requirement, AGENT.md §2.1). This document records how the PRO boundary was
determined, what is PRO, which free alternatives replace PRO features, and
every Scripting API RecompDeck uses.

## 1. Source and method

- Source of truth: the `"pro": true` flags in the official documentation index
  `doc.json`, shipped as `Scripting Documentation.zip` in
  [`ScriptingApp/ScriptingApp.github.io`](https://github.com/ScriptingApp/ScriptingApp.github.io)
  (`scripting/App Store/` and `scripting/TestFlight/`), checked at commit
  `381a7a623cecac4f6a51fdff958c8c0c00e3c911` (2026-08-19).
- A page is PRO if it or any parent carries the flag (skill S1).
- Regenerate: unzip both archives, then
  `python3 tools/audit/extract_pro.py <appstore dir> <testflight dir>`.

| Channel | PRO pages | free pages |
|---|---|---|
| App Store | 117 | 248 |
| TestFlight | 120 | 270 (additional PRO modules: `home_screen_ui`, `live_photo`, `video_editor`) |

## 2. PRO modules (App Store documentation)

**Entirely PRO (37):** `alarm_live_activity`, `alarm_manager`, `app_store`,
`archive`, `assistant`, `assistant_tool`, `audio_capture`,
`av_asset_reader_writer`, `av_capture_session`, `background_keeper`,
`bluetooth`, `cloud-shared-data`, `control_widget`, `font_picker`, `github`,
`haptics`, `headphone_motion_manager`, `health`, `homekit`, `http_server`,
`language_model_session`, `media_composer`, `media_library`,
`natural_language`, `remote_push`, `rime`, `safari_browser_scripts`,
`safari_redirect_rules`, `safari_search_shortcuts`, `spotlight`, `sqlite`,
`ssh`, `system_music_player`, `translation`, `translation_ui_provider`,
`video_recorder`, `web_scraper`.

**Partially PRO (4):**

| Module | PRO pages | Free pages remain free |
|---|---|---|
| `custom_keyboard` | Custom Keyboard | 1 |
| `intent` | SnippetIntent, `Intent.continueInForeground`, `Intent.requestConfirmation` | 2 |
| `mapkit` | MapDirections, MapSnapshotter, MapLookAround | 8 |
| `view_modifiers` | Picture-in-Picture view modifiers | 80 |

All 96 pages under **Views** are free.

## 3. PRO features we would have liked, and the free replacement

| PRO feature | Why it would help | Free replacement in RecompDeck |
|---|---|---|
| `Archive` (tar/gzip) | unpack the love.js npm tarball | own gzip frame + ustar parser (`src/core/archive.ts`) with `Data.decompressed` (Apple Compression, raw DEFLATE), size-checked against the gzip trailer; WebView `DecompressionStream` fallback |
| `HttpServer` | serve the game to the WebView | `WebViewController.loadFile(path, allowingReadAccessTo)` + chunked `<script>` blobs ([performance.md](performance.md) §3) |
| `BackgroundKeeper` | keep running in background | not needed: the game pauses; saves are flushed on `visibilitychange` |
| `Haptics` | rumble | `HapticFeedback` (free) |
| `SQLite` | metadata store | JSON files via `FileManager` + `Storage` |
| `Intent` PRO parts | Shortcuts integration | deep links via `Script.queryParameters` (`scripting://run/RecompDeck?game=red&slot=2`) |
| `ZIP` handling | mods/backups | `FileManager.zip/unzip` (free) after our own central-directory scan (`src/core/zipScan.ts`) |

## 4. APIs used by RecompDeck (all free)

Collected from the source (`scripting/RecompDeck/**/*.ts(x)`), doc page from
`doc.json`.

| API | Members used | Doc page (free) |
|---|---|---|
| `FileManager` | `documentsDirectory`, `temporaryDirectory`, `exists`, `isDirectory`, `stat`, `createDirectory`, `readDirectory`, `readAsData`, `readAsString`, `writeAsData`, `writeAsString`, `appendData`, `appendText`, `copyFile`, `rename`, `remove`, `zip`, `unzip` | Utilities > FileManager |
| `Data` | `fromUint8Array`, `fromBase64String`, `combine`, `slice`, `decompressed`, `toBase64String`, `toUint8Array` | Utilities > Data |
| `Crypto` | `sha1`, `sha256` | Utilities > Crypto |
| `Storage` | `get`, `set` | Utilities > Storage |
| `fetch` (import from `"scripting"`) | `timeout`, `shouldAllowRedirect`, `Response.data()` | Utilities > Request > fetch |
| `WebViewController` | `ephemeral`, `loadFile`, `loadHTML`, `waitForLoad`, `evaluateJavaScript`, `addScriptMessageHandler`, `shouldAllowRequest`, `dispose` | Device Capabilities > WebViewController |
| `WebView` (view) | `controller` | Views > WebView |
| `DocumentPicker` | `pickFiles`, `exportFiles`, `stopAcessingSecurityScopedResources` | Device Capabilities > DocumentPicker |
| `ShareSheet` | `present` | Device Capabilities > ShareSheet |
| `Dialog` | `alert`, `confirm` | Views > Dialog |
| `Safari` | `openURL` | Device Capabilities > Safari (not "Safari Browser Scripts", which is PRO) |
| `HapticFeedback` | `lightImpact`, `mediumImpact`, `heavyImpact` | Device Capabilities > HapticFeedback (not `Haptics`, which is PRO) |
| `Device` (import) | `preferredLanguages`, `systemLocale` | Device Capabilities > Device |
| `Script` (import) | `name`, `directory`, `queryParameters`, `exit` | Script > Script |
| `Navigation` (import) | `present`, `useDismiss` | Views > Navigation |
| Views (import) | `Button`, `HStack`, `Image`, `List`, `NavigationLink`, `NavigationStack`, `Picker`, `ProgressView`, `Section`, `Spacer`, `Stepper`, `Text`, `Toggle`, `VStack`, `WebView`, `ZStack` | Views |
| Hooks (import) | `useState`, `useEffect` | Views |
| View modifiers | `navigationTitle`, `toolbar`, `sheet`, `trailingSwipeActions`, `font`, `foregroundStyle`, `frame`, `padding`, `lineLimit`, `textSelection`, `ignoresSafeArea`, `statusBarHidden` (+ `Section` `header`/`footer`, `Picker` `tag`) — no PiP modifiers | View Modifiers (free pages) |

## 5. Documentation vs. declarations (noted per AGENT.md §7)

1. **`CompressionAlgorithm`**: `global.d.ts` declares a numeric enum
   (`lzfse = 0, lz4 = 1, lzma = 2, zlib = 3`), the documentation shows string
   values (`"zlib"`). RecompDeck uses the runtime enum when it exists and falls
   back to the documented string (`runtimeManager.ts` `zlibAlgorithm()`); the
   inflated size is always checked against the gzip trailer, so a wrong
   interpretation cannot go unnoticed.
2. **`evaluateJavaScript`**: documented as "must use `return` to get the
   value" (the body is wrapped in a function). The page protocol relies only
   on synchronous `return` values. The gunzip **fallback** additionally uses
   `await` in the body (WKWebView `callAsyncJavaScript` semantics); it runs
   only if the native inflate fails and its result is size-checked. Device
   check listed in [verification.md](verification.md).
3. `DocumentPicker.stopAcessingSecurityScopedResources` is spelled with a
   single "c" in "Acessing" in both documentation and declarations; the code
   uses that spelling.
