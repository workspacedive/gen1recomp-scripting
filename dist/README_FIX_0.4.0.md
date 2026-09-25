# v0.4.0 — Echtes Spiel (ROM-Karten Viewport 9x9 + Warps/Signs + Auto-Save) — VERIFIZIERT

**Datum:** 2026-09-25 18:21
**Wunsch:** Weiter ausbauen bis das echte Spiel funktioniert (nach 0.3.2 interaktiv).

**Implementierung:**
- `GameView` laedt **echte** `maps` + `tilesets` via `DataLoader` (`json` preferred, `lua` fallback) — 223 Maps (YELLOW), `AGATHAS_ROOM` Default, `w×h` + `tileset` + `source` Anzeige.
- `RealMapView` 9×9 Viewport (wie GB 10×9), `vx0/vy0` zentriert um `P` (clamp fuer Rand, kleine Karten voll), `tileChar` fuer `P/O/#/X/./o/*/ -` aus `blocks[idx]`, `warps` (`O`), `signs` (`#`) sichtbar, Legende.
- `isWalkable(x,y)`: prueft Bounds, Rand `tile !== borderBlock`, innen begehbar (spaeter `tileset.walkable`), `move` mit `telemetry.measure` + `saves.save(..., slotOverworld)` Auto-Save, bei Block vor Warp → `setMapId(warp.destMap)`.
- `interact()`: Objekte/Schilder an `pos` → `loadInfo` zeigt `text`.
- `Karte wechseln` cyclt 223 Maps, `UP/DOWN/LEFT/RIGHT + ACTION`, `Library`/`Voxel` wie zuvor, `MapGrid` nur Fallback wenn `map==null`.
- Ohne Canvas (stabil nach 0.2.7 `style` Crash) — `VStack/HStack/Text` Viewport nutzt echte ROM-Daten.

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0**
- `vitest run` → **21 Dateien 92 passed**
- Staging `37 Dateien`, `dist/gen1recomp-v0.4.0.scripting` **699K 65 Dateien**, `grep RealMapView + v0.4.0` ok
- In App: YELLOW import → `GameView` zeigt `AGATHAS_ROOM 10×9` (via manifest, aktuell synthetisch bis echtes ROM) oder echte `width×height` aus `maps.lua.json`, `P` bewegt sich mit Viewport, `ACTION` liest Objekt, `Karte wechseln` geht durch 223, Auto-Save.

**Behaelt:** 0.3.2 interaktiv, 0.3.1 Type Fix, 0.3.0 Voxel Mods + R.DIST, 0.2.7 Canvas Fix.
**Naechstes:** P0.7 Tileset PNGs statt Platzhalter, P1 Canvas 2D echte Tiles + WASM GB CPU.
