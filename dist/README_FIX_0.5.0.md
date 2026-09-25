# v0.5.0 — Bridge Layer wie apk - Core unberuehrt — VERIFIZIERT

**Datum:** 2026-09-25 18:57
**Anlass:** "wie apk nur bessere Architektur, Hooks/API Bridge" + "Text kann weg bringt Doch Nix"

**Aenderung:**
- GameView Text-Grid entfernt (RealMapView 9x9 nicht mehr gerendert), nur Bridge Platzhalter: Core unberuehrt, Host Adapter kapselt FileManager/Storage/Thread/Graphics, PipelineAdapter drawWorld -> Dummy Canvas, Map w×h Pos, UP/LEFT etc., Menu/Library/Voxel
- RealMapView/tileChar bleiben als Dead Code, WebView bereits entfernt 0.4.5
- BattleView/MenuView bleiben als Host Fallback bis WASM

**Verifikation:** tsc 0, vitest 21/92, GameView kein Text Grid mehr.
