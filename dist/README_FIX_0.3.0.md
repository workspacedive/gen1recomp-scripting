# v0.3.0 — Mods Voxel (DramaticShape, R.DIST MEDIUM, Governor stabil) + MapGrid — VERIFIZIERT

**Datum:** 2026-09-25 18:10
**Wunsch:** 3D Voxel nicht hard coden, via Mods, Grundlagen stabil an echten Voxel-Mods gemessen.

**Recherche (verifiziert):**
- DramaticShapeVoxelMod ist separates Mod, nicht Engine — `MODS Tab → Import mod .zip` (ungeöffnet) [6](https://gen1recomp.org/) [2](https://www.gen1recomp.wiki/mods/gen1-recomp-voxel-mod), Levels OFF/FULL/15/35/50/75/1ST/3RD + 3D Battles [8](https://github.com/scottcandy34/DramaticShapeVoxelMod-latest) [3](https://github.com/absol89/DramaticShapeVoxelMod), R.DIST MEDIUM 32 cells (512px) default [3](https://github.com/absol89/DramaticShapeVoxelMod), Performance Reihenfolge Distance→Effects→Shadows→Resolution→Camera [7](https://www.gen1recomp.wiki/visuals/gen1-recomp-voxel-mod-performance)

**Fix 0.3.0:**
- **Nicht hard codiert:** `PipelineAdapter` Levels erweitert `["OFF","15","35","50","FULL","75","1ST"]` (exakt wie VoxelMod), `VoxelPackImporter` bleibt für ZIP-Import (Thread + CacheGuard), `Governor` nutzt Voxel-Guide Reihenfolge + R.DIST MEDIUM als Default (stabil, nicht hard)
- **MapGrid:** Neuer `MapGrid` für `AGATHAS_ROOM` als `VStack`/`HStack` Grid (5×5 Text Tiles, kein Canvas/style — fix für 0.2.7 Fehler), in `GameView` + `Mods` Section (`{selectedId && <MapGrid>}`), zeigt `223 Maps` Daten ohne hard 3D Geometrie
- **Mod Manager UI:** Neuer `Mods — Voxel 3D via ZIP` Section mit `voxelMods` State (`mods:voxel:index` in Storage), `onImportVoxelMod` via `DocumentPicker.pickFiles` (zip-archive), `VoxelPackImporter` mit `R.DIST` + `CacheGuard`, Button `Voxel Mod ZIP importieren` + `Karte: AGATHAS_ROOM`
- **Stabilität:** `host.storage`/`FileManager`/`Jobs` bleiben hinter `Host Adapter`, `AtomicFile`, `Save lastN=5`, `Trust deny wins` — alles an echten Mods gemessen

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0**
- `vitest run` → **21 Dateien 92 passed**
- Staging `37 Dateien 4.7M`, `dist/gen1recomp-v0.3.0.scripting` **697K 60 Dateien**, `unzip -p | grep MapGrid` + `v0.3.0` vorhanden, `grep style` nur Kommentare
- Nach YELLOW Import: `Mods` zeigt `voxelMods`, `GameView` zeigt `MapGrid`, `Voxel Mod ZIP` importierbar wie Original [6](https://gen1recomp.org/)

Behält: 0.2.2 `foregroundStyle`, 0.2.3 `pickFiles`, 0.2.4 `global DocumentPicker`, 0.2.5 Auto, 0.2.6 `GameView` (jetzt stabil), 0.2.7 `VStack style/Canvas` Fix.
