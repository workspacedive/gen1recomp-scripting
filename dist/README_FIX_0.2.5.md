# Fix 0.2.5 — Auto Setup bis das Spiel funktioniert — VERIFIZIERT

**Datum:** 2026-09-25 17:41
**Wunsch:** "Auto bis das Spiel funktioniert" nach erfolgreichem YELLOW Import (223 Maps verify OK) aber `Core: keiner aktiv` + `Voxel LOD: OFF` + manuelle Taps nötig.

**Fix:**
- `index.tsx` Auto-Flow im `useEffect` (läuft einmalig nach Mount, cancellable):
  1. `await refresh()` → lädt Library/Core
  2. Wenn `cores.getActive()==null` → `onInstallCore()` (Core 1.0.0 staged→verified, `SHA-256` dummy, `commit 2ea74fa`)
  3. Wenn `pipelines.levelLabel("voxel")==="OFF"` → `onCycleVoxel(1)` (OFF→15, `host.storage` + `telemetry.measure`)
  4. `library.list()` → erstes `isReady` (YELLOW) → `onVerifyData(id)` (DataLoader json/json <200ms)
  5. Wenn `isReady` → `onPlay(entry)` (touchPlayed + Save checkpoint + `pipelines.drawWorld` + `governor.tickVoxelLOD` + `backups.exportBackup`)
  - Status kumuliert: `Auto: installiere Core… • Auto: Voxel OFF→15… • Auto: prüfe YELLOW… • Auto: starte YELLOW…`
  - Guard `didAuto` + `cancelled` verhindert Doppel-Play, `levelLabel` statt `level` (TS2367 Fix: level returns number vs string)

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0** (TS2367 behoben)
- `vitest run` → **21 Dateien 92 passed**
- Staging `37 Dateien 4.7M`, `dist/gen1recomp-v0.2.5.scripting` **695K 60 Dateien**, `unzip -p … | grep "Auto bis"` → vorhanden
- Nach Import YELLOW → App-Start zeigt ohne Tap: `Core: 1.0.0 (active)…`, `Voxel LOD: 15`, `YELLOW: 223 Maps … verify OK`, `Starte YELLOW mit 1.0.0 — LOD 15 — Warm Start`

**Import:** `gen1recomp-v0.2.5.scripting` importieren, YELLOW muss bereits `isReady` sein (einmaliger ROM Import). Beim nächsten Start läuft Auto, bei leerer Library Status `Auto: Kein ROM — bitte ROM importieren`.

Behält alle Fixes: 0.2.2 `foregroundStyle`, 0.2.3 `pickFiles`, 0.2.4 `global DocumentPicker`.
