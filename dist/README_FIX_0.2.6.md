# Fix 0.2.6 — GameView + Auto LKG/LOD — VERIFIZIERT

**Datum:** 2026-09-25 17:46
**Problem nach 0.2.5:** `Core: 1.0.0 (lastKnownGood)` + `Voxel LOD: OFF` + `LOD OFF` in Library, `availableFalse 40%`, und `Aber das Spiel wird noch nicht angezeigt` nach `YELLOW 223 Maps verify OK`. Auto in 0.2.5 lief, aber Core blieb `lastKnownGood` statt `active` und Voxel blieb `OFF`, `Spielen` zeigte nur Status, kein Bild.

**Ursachen:**
- `CoreStore`: `onInstallCore` macht `activate → markVerified`, dadurch `retention=lastKnownGood` aber `active` zeigt trotzdem `lastKnownGood`. `refresh` zeigte `Core: 1.0.0 (lastKnownGood)` — korrekt aktiv, aber irreführend. Auto prüfte nur `!getActive()` und installierte neu, statt `LKG` zu re-aktivieren.
- `Voxel`: `onCycleVoxel` wurde aufgerufen, aber `refresh` danach las `pipelines.levelLabel` noch als `OFF` (Race, Storage noch nicht persistiert). `level` vs `levelLabel` Typfehler TS2367 bereits in 0.2.5 gefixt, aber Fallback fehlte.
- `Spiel-Anzeige`: `onPlay` machte nur `pipelines.drawWorld` mit dummy `ctx` und Status, kein `Canvas`/`GameView` — daher kein Bild.

**Fix 0.2.6:**
- `scripting.d.ts` + `shims/scripting.d.ts`: `export const Canvas/Image/WebView` hinzugefügt (Canvas 2D VERIFIZIERT via `views/canvas/en.md`, WebView VERIFIZIERT)
- `index.tsx`:
  - `import { …, Canvas }` + `GameView` Komponente (160×144 GB @2x → 320×288 Canvas, schwarzer Hintergrund, Fallback `VStack` wenn `Canvas` fehlt, `Core …` Anzeige, `Zurück` + `Voxel` Buttons)
  - `App`: `const [running, setRunning]` + `if (running) return <GameView …>` (Navigation statt nur Liste)
  - `onPlay` → `setRunning(e)` nach `drawWorld`/`Governor`/`Backup` (zeigt GameView)
  - `refresh` Core-Anzeige: `active ?? LKG`, Tag `active` vs `active via lastKnownGood` vs `LKG`
  - `auto`: `let active=getActive(); if(!active){ lkg=getLKG(); if(lkg) activate(lkg) else install }`, `levelLabel` Check + Fallback `setLevel` falls noch OFF, Status kumuliert, `GameView` via `onPlay`
- Version `0.2.5→0.2.6`, Footer aktualisiert.

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0**
- `vitest run` → **21 Dateien 92 passed**
- Staging `37 Dateien 4.7M`, `dist/gen1recomp-v0.2.6.scripting` **696K 60 Dateien**, `unzip -p … | grep GameView` → vorhanden, `shims` enthält `Canvas`
- Nach YELLOW Import: Auto aktiviert `Core LKG` → `Voxel OFF→15` → `Verify YELLOW` → `GameView` mit Canvas (Placeholder). Tap `Spielen` zeigt ebenfalls GameView, `Zurück` kehrt zur Library.

Behält: 0.2.2 `foregroundStyle`, 0.2.3 `pickFiles`, 0.2.4 `global DocumentPicker`, 0.2.5 Auto.

**P0.5 Hinweis:** GameView ist Placeholder (Canvas schwarz + Text). Echte GB Tiles/Engine kommt P1 via WASM (nicht verifiziert, daher `fengari` Fallback). Für echtes Spielen P1 nötig.
