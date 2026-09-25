# v0.3.2 — Interaktiv MapGrid (P beweglich) + GameView spielbar + Architektur Ausbau — VERIFIZIERT

**Datum:** 2026-09-25 18:15
**Wunsch:** Spiel langsam spielbar + angezeigt, Plan/Architektur weiter ausbauen (nach 0.3.1 Type Fix).

**Fix:**
- **MapGrid interaktiv:** `MapGrid({entry, playerPos})` mit `px/py` 1..3, `row(y)` generiert 5×5 Grid `▓/·/P`, `playerPos` via `useState({x:2,y:2})` in `GameView`, `move(dx,dy)` clamp 1..3 + `telemetry.measure`, `HStack` Buttons `↑ ← ↓ →` — P bewegt sich live, stabil ohne Canvas/style.
- **GameView spielbar:** `VStack` mit `MapGrid playerPos`, `Core` + `Governor` Anzeige, `↑←↓→` + `Zurück/Voxel` Buttons, `if(running) return <GameView>` Navigation, `onPlay → setRunning` nach `drawWorld`/`Governor`/`Backup`.
- **Architektur Ausbau:** `docs/ARCHITEKTUR.md` + `77.6` neu: Mods Voxel nicht hard codiert, `R.DIST MEDIUM 32 cells`, `Governor` Priorität aus Voxel-Guide, `P0.6` (0.3.2) interaktiv, `P0.7` echte `json` Tiles, `P1 WASM` Roadmap.

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0**
- `vitest run` → **21 Dateien 92 passed**
- Staging `37 Dateien`, `dist/gen1recomp-v0.3.2.scripting` **697K 60 Dateien**, `grep MapGrid` + `move` + `v0.3.2` vorhanden, `grep style` nur Kommentare
- In App: `YELLOW läuft (15)` → `MapGrid` 5×5 mit `P`, `↑←↓→` bewegt `P`, `Mods` Section stabil

Behält: 0.3.0 Voxel Mods + R.DIST, 0.3.1 Type Fix, 0.2.7 GameView Fix.
