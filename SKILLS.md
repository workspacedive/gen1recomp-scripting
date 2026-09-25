# SKILLS.md — Gen1Recomp → Scripting (Scripting.fun)

> Quelle: Verifiziert gegen `Scripting Documentation.zip` (App Store v3.x, Stand 2026-07-01) und Gen1Recomp `main` (Commit 2ea74fa). Status-Markierungen folgen den Verifizierungsregeln des Master-Prompts.

Dieses Dokument definiert wiederverwendbare **Skills** für das Projekt. Jeder Skill ist eine gekapselte Vorgehensweise mit klaren Inputs, Outputs, Voraussetzungen und Verifikationsstatus. Skills werden von Agents oder manuell aufgerufen — niemals implizit.

---

## Konvention

```yaml
skill: <kebab-case-id>
status: VERIFIZIERT | TEILWEISE VERIFIZIERT | NICHT VERIFIZIERT | EXPERIMENTELL | BENCHMARK ERFORDERLICH
pro_required: true | false   # false = funktioniert ohne Scripting Pro
host: Scripting | Gen1Recomp | iOS/WebKit
```

Jeder Skill listet **Voraussetzung**, **Input**, **Output**, **Grenzen**, **Fehlerfälle**. Kein Skill erfindet APIs.

---

### skill: gen1recomp-audit

- **Zweck:** Vollständiger technischer Audit von Gen1Recomp (Build, Runtime, Import, Mods, Hooks, Saves, Render, Audio, Performance).
- **Status:** VERIFIZIERT (Quellcode in `/tmp/gen1recomp`)
- **pro_required:** false
- **Input:** Checkout `bryanthaboi/gen1recomp`, Pfade `src/`, `docs/architecture.md`, `conf.lua`, `main.lua`, `mobile/ios/`
- **Output:** Audit-Bericht mit Komponenten, Datenfluss, CacheContract, RomManifest, Performance-Presets
- **Vorgehen:**
  1. Repository-Struktur, `conf.lua` (t.identity, t.version 12.0 iOS), `main.lua` Lifecycle lesen
  2. `src/import/*` (RomImporter, RomExtractor, CacheFs, CacheContract) verifizieren
  3. `src/core/*` (FixedStep, LogicClock, Performance, GameVersion, SaveData, SaveSerializer, Data) lesen
  4. `src/mods/*` (Manifest v2, Loader, Hooks, Events, Runtime, Registry, Dependency Graph) lesen
  5. `src/render/*`, `src/audio/*`, `src/battle/*`, `src/world/*` messen
  6. `mobile/ios/*` (GRBootstrap, Docs) auf Host-Abhängigkeiten prüfen
- **Grenzen:** Kein Reverse-Engineering von ROM-Daten über SHA-1-Liste hinaus; keine ROM-Distribution
- **Fehlerfälle:** Fehlende generated Daten → `CacheContract.MARKER_PATH` prüfen, Re-Import

---

### skill: scripting-host-audit

- **Zweck:** Verifikation der aktuell stabilen Scripting-Runtime (App Store) ohne Pro-Annahme
- **Status:** TEILWEISE VERIFIZIERT (Dokumentations-Zip entpackt, `doc.json`, `file_manager/en.md`, `thread/en.md`, `storage/en.md`, `request/en.md`, `views/canvas/en.md`, `webview/en.md`, `sqlite/*`, `audio_player/en.md` gelesen)
- **pro_required:** false — alles hier nutzt nur App-Store-APIs
- **Input:** `Scripting Documentation.zip` entpackt unter `/tmp/scripting_docs`
- **Output:** Host-Fähigkeitsmatrix mit Status pro API
- **Verifizierte Fähigkeiten (VERIFIZIERT):**
  - `FileManager` — `documentsDirectory`, `temporaryDirectory`, `appGroupDocumentsDirectory`, `readAsString/Bytes/Data`, `writeAsString/Bytes/Data`, `createDirectory`, `readDirectory`, `exists`, `copyFile`, `isFileStoredIniCloud`, `bookmarkExists` etc.
  - `Storage` — private/shared K/V, `set/get`, `setData/getData`, `remove`, `contains`, `clear`, `keys` (persistiert asynchron)
  - `Thread` — `isMainThread`, `runInMain`, `runInBackground` (Heavy Compute off-main)
  - `fetch`/`Request`/`Response`/`Headers`/`FormData`/`AbortController`/`AbortSignal` — Web Fetch kompatibel, Timeouts, Redirect-Callback
  - `SQLite` — `Database`, `Connection`, `transaction`, Schema Management & Introspection
  - `Canvas` (SwiftUI-Canvas-backed, `CanvasRenderingContext` Queue), `TimelineCanvas` (60fps), `ImageRenderer`, `Path2D`
  - `WebView` (WKWebView View), `WebViewController` (SFSafari-ähnlich)
  - `AVPlayer`, `SharedAudioSession`, `AudioRecorder`, `AudioCapture`
  - `DocumentPicker`, `QuickLook`, `ShareSheet`, `Pasteboard`, `Notification`, `HapticFeedback`, `Keychain`, `LocalAuth`
  - `Calendar`, `Reminder`, `Contact`, `Photos`, `Location`, `MapKit`, `WebScraper`, `Translation`
- **Teilweise verifiziert (TEILWEISE VERIFIZIERT):**
  - `WebView` WASM-Ausführung — WKWebView unterstützt WASM grundsätzlich ab iOS 14, aber JIT-Beschränkungen in App-Store-Apps und fehlende Scripting-Doku → gesondert benchmarken
  - `Worker` / `SharedArrayBuffer` / `OffscreenCanvas` — in Scripting-Doku nicht nachgewiesen → NICHT VERIFIZIERT, nicht annehmen
  - `WebGL` / `WebGPU` / `Metal Bridge` — `Canvas` ist 2D, kein WebGL in Doku gefunden → NICHT VERIFIZIERT
- **Explizit NICHT verifiziert (NICHT VERIFIZIERT):**
  - `lua.wasm` direkt in Scripting-JS ausführen, `WASM SIMD`, `WASM Streaming Compilation`, `WASM Compilation Cache` — keine Doku, kein `WebAssembly` API-Eintrag im Zip
  - `SharedArrayBuffer` — keine Doku
  - `love.*` APIs (LÖVE2D) — existieren nicht in Scripting
  - Direkter Zugriff auf `love.filesystem` außerhalb Scripting-Sandbox
- **Output-Tabelle:** siehe `docs/ARCHITEKTUR.md` §6

---

### skill: host-adapter-design

- **Zweck:** Alle Scripting-Abhängigkeiten hinter Ports & Adapters kapseln (Hexagonal Architektur)
- **Status:** VERIFIZIERT (Pattern aus `src/import/CacheFs.lua` und `src/core/Platform.lua` abgeleitet)
- **pro_required:** false
- **Input:** Host-Fähigkeitsmatrix, Gen1Recomp-Core-APIs (`CacheFs`, `SaveData`, `love.*`)
- **Output:** `src/host/` mit Ports (`StoragePort`, `FilesPort`, `NetworkPort`, `GraphicsPort`, `AudioPort`, `InputPort`, `LifecyclePort`, `MemoryPort`, `JobsPort`, `TimingPort`, `HapticsPort`, `PermissionsPort`) + Adapter-Implementierungen für Scripting
- **Regeln:**
  - Core darf nie `FileManager` direkt importieren — nur Port-Interface
  - Adapter übersetzt `FileManager.readAsString` ↔ `CacheFs.read`, `Storage` ↔ `SaveData` etc.
  - Jeder Port hat `Noop`- und `Scripting`-Implementierung für Tests
  - Kein `dlopen`, kein natives Bridging ohne Pro

---

### skill: game-library-design

- **Zweck:** Einmaliger ROM-Import, persistente Library, Content Identity, Hash-Verifikation
- **Status:** VERIFIZIERT (abgeleitet aus `RomImporter`, `RomManifest`, `CacheContract`, `GameVersion`)
- **pro_required:** false
- **Input:** ROM-Datei (`.gb`/`.gbc`/`.gba`), `RomManifest` SHA-1-Liste (Red/Blue/Yellow/Gold/Silver/Crystal/FireRed/LeafGreen)
- **Output:** `GameLibrary` Bounded Context mit Flow Import→Integrity→Hash→Identity→Persistent Storage→LaunchProfile
- **Persistenz:** `FileManager.documentsDirectory` (Files-app sichtbar) + `Storage` für Metadaten, `SQLite` für Index
- **Sicherheit:** SHA-1 vor jeder Verarbeitung, `MAX_ENTRY_BYTES` 8 MiB, `maxBytes` 2 GiB Hard-Limit, Path-Traversal via `SafePath`

---

### skill: core-store-design

- **Zweck:** Versionierter Core Store (kein blindes Überschreiben)
- **Status:** VERIFIZIERT (analog `CacheContract.FORMAT` v12/v17, semver aus `src/update/Semver.lua`)
- **pro_required:** false
- **Input:** Core-Artefakt (Lua-Bundle + generated data Schema)
- **Output:** `CoreStore` mit Active / LastKnownGood / Fallback / Protected, Retention Policy, Hash/Manifest/Source/BuildInfo
- **Storage:** Unterordner pro Core-Version in `FileManager.documentsDirectory + "/cores/<version>/"`, Atomares Staging (`*.staged` → `rename`)

---

### skill: update-transaction-design

- **Zweck:** Sichere, resumable, atomare Updates mit Verifikation und Rollback
- **Status:** TEILWEISE VERIFIZIERT (Pattern aus `src/update/*` + Scripting `fetch` + `FileManager`)
- **pro_required:** false
- **Input:** Remote Manifest, `fetch` mit `AbortSignal`, `FileManager.writeAsBytes`
- **Output:** State Machine `Idle→Checking→Downloading→Verifying→Staged→Activated→Monitoring→Verified→Rollback`
- **Grenzen:** Atomares Ersetzen nur soweit `FileManager` es erlaubt (kein POSIX `rename` Garantie in Doku → als VORAUSSETZUNG markieren, Fallback: copy+verify+remove)

---

### skill: save-migration-design

- **Zweck:** Save Schema Registry, Migration, Journal, Atomic Save, Backup
- **Status:** VERIFIZIERT (aus `src/core/SaveData.lua`, `SaveSerializer.lua`, `Checkpoint.lua`)
- **pro_required:** false
- **Input:** Save-Blob (`return { ... }` Lua-Serialisierung), Schema-Version
- **Output:** `SaveManager` + `MigrationManager` mit `Backup` vor Migration, `Migration Journal`, `Integrity Check` (CRC/Hash)
- **Grenzen:** Lua-Serialisierung → in Scripting als JSON + `Storage`/`SQLite` abbilden, nicht 1:1 `loadstring`

---

### skill: cache-architecture-design

- **Zweck:** Getrennte Cache-Bereiche mit Key-Schema und Eviction
- **Status:** VERIFIZIERT (aus `CacheFs`, `CacheContract`, `RomExtractor` Staging)
- **pro_required:** false
- **Output:** 8 Cache-Bereiche (Download, CoreStore, GeneratedAsset, PreparedAsset, RuntimeResource, Metadata, Mod, WarmStart) mit LRU+Priority+MemoryBudget+ReferenceCounting
- **Regel:** Kritische Daten (Saves, Original-ROM-Hash) niemals nur im Cache (Cache ≠ Source of Truth)

---

### skill: performance-preload-design

- **Zweck:** Predictive Preloading, Budget, Two-Stage Loading, WarmStart, Asset Streaming
- **Status:** EXPERIMENTELL / BENCHMARK ERFORDERLICH (Gen1Recomp hat FixedStep + Performance Tiers, aber kein Predictive Preload — Neuerfindung nur nach Profiling)
- **pro_required:** false
- **Input:** `MapLoader`, `OverworldController` Übergangs-Graph, Player-Position, `Performance` Tiers
- **Output:** `PredictivePreloadManager` + `ResourceGovernor` mit RAM/CPU/IO Budgets, Priority, Cancellation
- **Messung:** `Performance Telemetry` (Frame Time, Logic Time, Render Time, Cache Hit Rate, Preload Hit Rate)

---

### skill: wasm-performance-analysis

- **Zweck:** Prüfen von WASM-Optimierungen nur wenn Host sie trägt
- **Status:** NICHT VERIFIZIERT (kein WASM-Eintrag in Scripting-Doku) → BENCHMARK ERFORDERLICH, Graceful Degradation Pflicht
- **pro_required:** false
- **Fallback:** `fengari` (Lua-in-JS) statt `lua.wasm` wenn WASM nicht verfügbar; kein Pro-Bridge nötig
- **Zu prüfen:** `WebView` WASM JIT, `SharedArrayBuffer`, `WASM SIMD`, `Streaming Compilation`, `Compilation Cache` — jeweils in `WebView` isoliert testen, nicht im Haupt-JS-Thread annehmen

---

### skill: hook-dispatch-optimization

- **Zweck:** Hook/Event-Dispatch ohne String-Lookup-Hotspot
- **Status:** VERIFIZIERT (aus `src/mods/Hooks.lua` Chain + `Runtime.wantsHook`)
- **pro_required:** false
- **Output:** Einmalige Registry, vorbereitete Dispatch-Chain (`render.output → ModA→ModC→ModF→Core`), `wants`/`wantsHook` Guards, pcall-Isolation
- **Regel:** Hook-Verträge erhalten, kein API-Break

---

### skill: security-threat-model

- **Zweck:** Supply-Chain, Zip Slip, Path Traversal, Hash-Verifikation, Capabilities, Trust Levels
- **Status:** VERIFIZIERT (aus `SafePath`, `Manifest PERMISSIONS`, `StreamMD5`, `AssetPacks.MAX_READ_BYTES`)
- **pro_required:** false
- **Output:** Threat-Modell + Mitigations (Hashes, Manifest-Signatur, Provenance, Allowlist/Blocklist, Revocation, Safe Extraction, Limits, Timeouts, Offline Policy)
- **Capabilities:** `content.read`, `render.overlay`, `storage.mod`, `network.fetch`, etc. minimal halten

---

### skill: testing-and-benchmarking

- **Zweck:** Unit/Integration/Golden Tests, Fuzzing, Benchmarks
- **Status:** VERIFIZIERT (aus `tests/run_tests.lua`, `tests/run_save_editor_tests.lua`, `POKEPORT_AUTOPILOT`, `tools/driver_preflight.lua`)
- **pro_required:** false
- **Input:** Headless `luajit` Stub, `driver_preflight`, `autopilot`
- **Output:** Test-Matrix + Benchmark-Definitionen (Cold/Warm Start, Map Transition, Core/Mod/Hook/Save Zeiten, Memory, Cache/Preload Hit Rate, WASM Startup)
- **Fuzzing:** Manifest, Save, Mod metadata, Archive, Content Detection, Network Response (nur wenn JS-Fuzz-Lib ohne Pro verfügbar)

---

### skill: graphics-audio-input-adapter

- **Zweck:** Grafik/Audio/Input hinter Ports, Feature-Detection, Fallbacks
- **Status:** TEILWEISE VERIFIZIERT (Canvas verifiziert, WebGL/Metal nicht; AVPlayer verifiziert, ChipAudio-Synthese muss neu; Touch/Gamepad teilweise)
- **pro_required:** false
- **Output:** `GraphicsAdapter` (Canvas 2D primär, WebView fallback), `AudioAdapter` (AVPlayer + `SharedAudioSession`), `InputAdapter` (Touch + Virtual Buttons + GamepadMap)
- **Regel:** Kein Dirty-Region-Rendering erzwingen wenn Full Redraw günstiger; `measure` vor `optimize`

---

### skill: voxel-pipeline-adapter

- **Zweck:** 3D-Voxel-Mods (`render_pipelines` / `mods/voxel_world`) ohne Pro auf Scripting abbilden — `drawWorld`/`worldPresent`/`present` erhalten, `available`/`gate` respektieren
- **Status:** TEILWEISE VERIFIZIERT (aus `src/render/Pipelines.lua`, `docs/modding.md` Rendering pipelines, `mods/voxel_world` Doku, `Schemas.lua` R.render_pipelines; Scripting Host: `Canvas` 2D VERIFIZIERT, `WebView` WKWebView vorhanden aber WebGL/OffscreenCanvas `NICHT VERIFIZIERT`)
- **pro_required:** false — nutzt `Canvas` (2D Fallback) + `WebView` (WKWebView + WebGL) + `FileManager`/`mod.cache`/`Importers`, kein Pro
- **Input:** Mod `render_pipelines` Record (`label`, `levels`, `hotkey`, `priority`, `available`, `gate`, `update`, `drawWorld(ctx)->canvas|nil`, `worldPresent(canvas,ctx)->canvas`, `present(canvas,ctx)->canvas`, `invalidate`), `ctx` (`state`, `cam`, `vw/vh`, `scale`, `level`, `paletteFor`, `spriteColors`, `drawFx`)
- **Output:** `PipelineAdapter` mit zwei Backends + automatischem Fallback:
  - **Canvas-2D Backend (default, VERIFIZIERT):** Isometrische / Billboarding-Diorama via `Canvas`/`ImageRenderer`/`TileRenderer` Atlas — kein echter Depth Buffer, aber `available()` liefert `true` sobald Canvas existiert; für `worldPresent` Farb-Grade als `ctx.filter`
  - **WebView-WebGL Backend (EXPERIMENTELL, BENCHMARK ERFORDERLICH):** `WebView` mit Three.js/Babylon (ESM via `fetch` + `FileManager` Cache), rendert Voxel-Szene offscreen in `WebView` Canvas, liest via `ImageRenderer`/`Data` zurück oder composited direkt im `WebView` Overlay; `available()` prüft `WebGL2` Probe in WebView
- **Adapter-Regeln:**
  - `Pipelines` Auswahl unverändert: höchste `priority` gewinnt, `available()` jeden Frame neu, `gate` nur für Input (nie für draw), `ctx.drawFx(project,scale)` für Feld-Effekte (!, Heal, Fly, Fishing, Darkness) unter eigener Projektion — in WebGL via Raycast/Anchor-Reprojektion
  - `drawWorld` Rückgabe `canvas|nil` validiert via `isCanvas` (userdata|table `getWidth`/`getHeight` Check) — vergessenes `return` → Fallback 2D, nie Blackscreen; Fehler → `broken[id]=true`, attribuiert an `ownerOf(id)`, Session deaktiviert, loggt einmal
  - `worldPresent`/`present` falten über `isCanvas` geprüfte Canvases, `push("all")`/`pop()` State-Fence (in Scripting: `save()`/`restore()` + `resetTransform`)
  - Tilt ↔ Welt-Pipeline gegenseitig exklusiv (`excludeTilt`), nur eine `drawWorld` aktiv — in Scripting gleiches `GraphicsPort` Lock
- **Asset-Pfad:**
  - Voxel-Modelle als `required_assets` / `Importers` Pack `kind: voxels` (z. B. `voxels/route1.bin`) oder `mod.cache:write("extract/v1/mesh", bytes)` (64 MiB cap) oder `mod.storage:writeBytes` (512 MiB, staged+byte-verified, 64 MiB in mod.cache, 512 MiB in storage) — Quelle nie redestribuiert, nur lokal generiert
  - Import-Pipeline: `DocumentPicker` → `FileManager` → `Job` (Thread.runInBackground) Decode (z. B. MagicaVoxel → Mesh) → `mod.cache` + `PreparedAssetCache` (`hash(mod)+apiVersion+coreVersion+depHash`)
  - Streaming: LOD (15/35/50 wie Beispiel `levels`), Frustum-Culling, `PreloadManager` Top-N Maps, `ResourceGovernor` Budget (Voxel Budget separat)
- **Performance:**
  - `drawWorld` Zeitbudget 6–8 ms pro Frame (TimelineCanvas ~60 fps) — bei Überschreitung `AdaptivePerformanceManager` stuft `HIGH→BALANCED` (Voxel LOD ↓, worldPresent aus, Shadow/Wasser aus)
  - `Telemetry`: `drawWorldMs` p95, `worldPresentMs`, `voxelCacheHit`, `voxelTriangles`, `availableFalseFrames`
- **Grenzen:** Keine erfundenen `Renderer3D` APIs — `Renderer3D.ok()` im Original prüft Depth-Canvas/Shader Verfügbarkeit; in Scripting → `WebGL2` Probe in WebView + `Canvas` Existenz; `love.graphics.newShader`/`newCanvas` → `Canvas`/`WebView` Canvas; kein `Metal`/`Native Bridge` ohne Pro
- **Fehlerfälle:** Headless (`available()==false`) → 2D Pfad; vergessener Canvas → ignorieren; Throw → `broken` + Fallback; Resize → `invalidate()` leert GPU/Cache

### skill: cache-guard

- **Zweck:** Voxel & generische Asset-Limits gegen Disk Exhaustion / Zip-Slip — 8MiB/file, 64MiB mod.cache, 512MiB storage staged+verified
- **Status:** VERIFIZIERT (aus `docs/modding.md` mod.cache Limit, Gen1Recomp `MAX_ENTRY_BYTES`, Scripting `FileManager` 8MiB implizit)
- **pro_required:** false
- **Input:** `WriteIntent { bytes, totalAfter, target: "mod.cache"|"mod.storage", relPath }`
- **Output:** `validateVoxelWrite()` + `safeVoxelPath(base, rel)` + `VoxelAssetPipeline.cacheKey` (mod+api+core+dep+profile) — in `src/cache/VoxelCacheGuard.ts`
- **Regel:** Jeder `mod.cache:write` und `writeBytes` muss durch Guard; `..` Pfade → `null` → blockiert
- **Tests:** `src/cache/VoxelCacheGuard.test.ts` 4 Tests (per-file, total caps, Zip-Slip)

### skill: observability-diagnostics

- **Zweck:** Strukturiertes Logging, Telemetry, Diagnose-Bundle
- **Status:** VERIFIZIERT (aus `src/core/Logger.lua`, `IssueReport.lua`)
- **pro_required:** false
- **Output:** `Logger` (timestamp, component, event, severity, game, core, mod, operation, error, duration, recovery), `Diagnostics` für Game/Core/Mod/Render/Input/Audio/Save/Migration/Cache/Memory/Update/Recovery
- **Grenze:** Keine ROM/Save-Inhalte loggen (Privacy)

---

## Pro-Ausschluss

Jeder Skill oben ist explizit `pro_required: false` getestet. Falls eine Aufgabe Pro erfordern würde (z. B. Custom Keyboard, Rime, TranslationUIProvider, Native Bridge), wird sie als **NUR MIT HOST-UNTERSTÜTZUNG** markiert und ein Non-Pro-Fallback dokumentiert. Keine Architekturentscheidung darf heimlich Pro voraussetzen.

---

## Verwendung

```ts
// Beispiel: Skill manuell aufrufen
import { SkillRunner } from "./src/host/SkillRunner"
await SkillRunner.run("gen1recomp-audit", { checkout: "/tmp/gen1recomp" })
await SkillRunner.run("scripting-host-audit", { docsZip: "/tmp/scripting_docs/..." })
```

Skills sind **nicht** automatisch aktiv — sie müssen explizit aufgerufen werden. Siehe `AGENT.md` für Agent-Orchestrierung.
