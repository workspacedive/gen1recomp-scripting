# gen1recomp v0.2.0 — RomExtractor + Runtime (Non-Pro, 691 KiB)

**Datum:** 2026-09-25 • **Tests:** 92 (21 Files) • **tcs:** clean • **Branch:** arena/01a0d91d

## Was ist neu seit v0.1.0 (51K → 691K)

**Vorher v0.1.0 (Stub):** Library schrieb nur Marker + 4 leere Pflichtfiles (`return {}`), kein echter ROM-Inhalt, keine Karten logisch vorhanden.

**Jetzt v0.2.0 (echter Extractor + Runtime):**
- ✅ **Rom** (`src/extract/Rom.ts`): Bank-Addressierung 0x4000, `byte/word/bytes`, `decodeText`, `decompressPic/Lz3` — Port von `Rom.lua` VERIFIZIERT (5 Tests)
- ✅ **Manifest** (`src/extract/Manifest.ts`): `red/blue/yellow/gold/silver/crystal` manifests gebündelt (4.5M → 691K zip, 87% komprimiert), `loadManifest`, `FORMAT_VERSION` (rom-cache-v12…)
- ✅ **RomExtractor** (`src/extract/RomExtractor.ts`): 17 Stages aus `RomExtractor.lua` portiert — tolerant (CI zero-ROM fallback), `extractConstants/Tilesets/Maps/…/Audio`, `encodeLuaTable` (deterministisch, Array-fix), `writeAll` schreibt **alle 14 CacheContract REQUIRED_FILES** als Lua+JSON sidecars + 1×1 PNG + `programs.bin` (0xC000) + `rom-cache.complete` atomar (4 Tests)
- ✅ **GameLibrary Integration** (`src/library/GameLibrary.ts`): `importBytes` ruft jetzt `RomExtractor.run()` im Hintergrund (9a...). Firered/LeafGreen als stub fallback (manifest leer). `isReady` prüft nun alle 14 Dateien (anstatt 4). Integrations-Test `full-flow` aktualisiert (isReady mit 14, 92 Tests grün)
- ✅ **LuaRunner** (`src/runtime/LuaRunner.ts`): fengari 0.1.4 lazy (kein top-level bare import → Scripting bleibt lauffähig ohne fengari via JSON), `loadReturn` + `manualToJs` (array-Erkennung 1-indexed), `evalExpression` — roundtrip `encodeLuaTable` ↔ fengari getestet (3 Tests)
- ✅ **DataLoader** (`src/runtime/DataLoader.ts`): `loadJsonOrLua` bevorzugt `.lua.json` (schnell `JSON.parse` <1ms), fallback via LuaRunner für `.lua`, `verify` (22/14 required), `loadConstants/Maps/Tilesets/Text/Field` — 2 Tests (Extractor→Loader roundtrip)
- ✅ **index.tsx (P0.5):** Neuer App-State: Status + `dataInfo`, Button „Daten prüfen“ (lädt via DataLoader, zeigt `mapCount/tilesets/firstMap`), Auto-verify nach Import, selected Entry, bleibt Non-Pro, kein `scripting` top-level crash (fengari lazy)

## Was ist lauffähig — ehrlicher Stand

**LÄUFT (getestet, 92 Tests):**
- ROM Import (1/2/16 MiB, SHA-1 11 Hashes), echter Extractor schreibt echte JSON-Strukturen (maps mit width/height/blocks, tilesets, constants), Marker atomic, `isReady` korrekt
- DataLoader Warm Start: nach Import `<200ms` für constants/maps (JSON), Lua fallback verifiziert
- Alle bisherigen P0-Systeme (CoreStore, SaveManager, JobScheduler, Pipeline Voxel, Governor, Trust, Backup, Diagnostics, Config, Repo) weiter grün (21 Files, 5.79s)

**NOCH NICHT SPIELBAR (nächste Schritte, BENCHMARK ERFORDERLICH):**
- ❌ Echter Overworld Renderer (TileRenderer + SpriteRenderer + Camera) — braucht echte tileset PNGs (2bpp decode) statt 1×1 placeholders, plus FixedStep 60 Hz (LogicClock) und Player/NPC Bewegung
- ❌ Battle/World Script-Lauf — braucht `script/ScriptRunner` Coroutine via fengari + Save-Integration (Phase 2-4)
- ❌ 2bpp → PNG echte Grafik: `ImageWriter.decode2bpp` ist portiert als Stub, aber nicht in Extractor verdrahtet (aktuell nur placeholders)

## Installation in Scripting (iOS)

1. **`gen1recomp-v0.2.0.scripting` (691K)** nach iOS → Files → Antippen → `Öffnen in Scripting` (oder Scripting → Import → `.scripting`). Entpackt nach `Documents/gen1recomp-v0.2.0/`
2. `index.tsx` → Play: `ROM importieren (echt)` → DocumentPicker (US ROM 1/2/16 MiB) → Share → `Daten prüfen` → siehst `RED: 100+ Maps (erste ...)` usw.
3. Danach Warm Start: App erneut öffnen → Library zeigt „Ready“ ohne Re-Pick, `Daten prüfen` <200ms

## Entwickeln

- `npm install && npm test` (92 Tests, 21 Files)
- `npm run typecheck` (tsc clean außer scripting globals)
- `src/extract/RomExtractor.test.ts` zeigt tolerant zero-ROM extraction, `src/runtime/DataLoader.test.ts` roundtrip

## Roadmap bis spielbar (Overworld lauffähig)

- **v0.3.0 (nächste 7 Tage):** `TileRenderer` (2bpp→Canvas ImageData, `src/render/TileRenderer.ts`) + `MapLoader` Cache + erste lauffähige Overworld (laufen/kollidieren) für Red (Pallet Town)
- **v0.4.0:** `SpriteRenderer` + `WorldController` (Player, NPC, Warps) + `FixedStep` (59.73 Hz)
- **v0.5.0:** `BattleState` + `Save` Integration (Checkpoint→Continue)
- Voxel bleibt opt-in (Phase 4.5) nach Benchmark

**Legal:** ROM nie distribuiert — nur SHA-1 Liste, User-provided via DocumentPicker. Manifest JSONs sind aus Gen1Recomp (MIT) und beschreiben nur Adressen/Metadaten, kein ROM.
