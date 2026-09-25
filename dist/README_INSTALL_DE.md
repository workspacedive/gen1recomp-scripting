# gen1recomp v0.1.0 — Scripting (.scripting) — Installation & Status

**Datei:** `gen1recomp-v0.1.0.scripting` (51 KiB, Non-Pro, Offline-First)

## Was ist lauffähig — ehrlicher Stand 2026-09-25

**LÄUFT (getestet, 78 Tests grün):**
- ✅ Library: ROM einmal importieren via DocumentPicker → SHA-1 geprüft (11 Hashes, 8 Games: Red/Blue/Yellow/Gold/Silver/Crystal×2/FireRed×2/LeafGreen×2) → `library/<id>/generated/rom-cache.complete` + Index → danach Warm Start ohne erneuten Pick
- ✅ Core Store: staged→verified `AtomicFile`, LKG/Retention 3+protected, `resolveForProfile`
- ✅ SaveManager: atomic (tmp→verify→copy), Backup lastN=5, Journal, Integrity sha256, Limits 2MiB/depth40, Migration Registry mit rollback → alle Saves (normal/engine/mod/checkpoint/config)
- ✅ JobScheduler: PriorityQueue 100/80/40/30/5 (voxel P30), AbortSignal, Deadline, Retry, DAG, `cancelByPriority` für Governor
- ✅ Pipeline Voxel: `render_pipelines` dreistufig (`drawWorld`/`worldPresent`/`present`, `available` jeden Frame, `gate` nur Input, `priority`, `broken`, `isCanvas`, Tilt-exklusiv) — Canvas2D Fallback VERIFIZIERT + WebView-WebGL Warm Cache EXPERIMENTELL, LOD OFF/15/35/50, `ctx.drawFx`, `invalidate`, Telemetry p95, Governor downgrade
- ✅ Cache/Security: VoxelCacheGuard (8MiB/file, 64MiB mod.cache, 512MiB storage, SafePath), TrustManager (Allow/Block/Revocation deny-wins, Provenance), AtomicFile DRY
- ✅ Backup/Diagnostics/Config/Repo: versionierte Exports, Bundle (Privacy), Feature Flags versioned, GitHub/local providers
- ✅ Host Adapter: FileManager/Storage/SQLite/Thread/fetch (VERIFIZIERT), ScriptingGraphicsAdapter (Canvas + WebView probe), alle Ports hexagonal

**NOCH NICHT SPIELBAR (Roadmap, BENCHMARK ERFORDERLICH):**
- ❌ Echter Game Loop (fengari Lua VM + generated data `maps.lua`/`tilesets` → TileRenderer/SpriteRenderer + FixedStep 60Hz) — Scaffold vorhanden, aber RomExtractor (maps decompile) noch nicht portiert → `index.tsx` zeigt Demo-UI statt Spiel
- ❌ Battle/World Script-Lauf — braucht Lua-Runtime + Save-Integration (Phase 2-4)
- ❌ WebGL Voxel in WebView ist EXPERIMENTELL — Canvas2D läuft, WebGL braucht BENCHMARK auf echtem iPhone

## Installation in Scripting (iOS)

1. **Auf iPhone:** Lade `gen1recomp-v0.1.0.scripting` herunter (Files App → Downloads).
2. **Tippe** die Datei → `Öffnen in Scripting` (oder in Scripting: `Import` → `Dateien` → `.scripting` wählen). Scripting entpackt nach `~/Documents/gen1recomp-v0.1.0/`.
3. **Öffne** `index.tsx` in Scripting → `Ausführen` (Play). Du siehst:
   - Library mit ROM-Import, Core-Info, Voxel LOD OFF/15/35/50 Buttons, Telemetry, Diagnostics
   - Teste: `ROM importieren` (nur US ROMs, 1/2/16 MiB, SHA-1) → `Spielen` (demo, legt checkpoint+backup an, zeigt Governor)
4. **Kein Pro nötig**, Offline-First — `FileManager.documentsDirectory` persistent, `cache/` evictbar.

## Wann erste spielbare Version?

**Schätzung ehrlich:** 2026-10-15 bis 2026-10-30 für **Phase 0-4** (Host+Library+Core+Mods/Saves+Renderer auf Canvas). Dann läuft Overworld (laufen/kollidieren, NPCs) für Red/Blue/Yellow — Gold/Silver/Crystal danach (Phase 1-2). Voxel bleibt opt-in (Phase 4.5). Wöchentliche `.scripting` Updates hier.

## Entwickeln

- Tests: `npm install && npm test` (78 Tests)
- Bench: `npx vitest bench --run src/render/bench/voxel.bench.ts`
- Docs: `docs/ARCHITEKTUR.md` §44.1 §76.1 §73.7b/c + `spec/pipeline-invariants.md` + `benchmarks/voxel-benchmark.md`

## Legal

Runtime ≠ Game Data. ROM wird nie distribuiert — nur SHA-1 Liste, User-provided via DocumentPicker.
