# v0.4.1 — Richtung + NPCs + Tile-Varianz — VERIFIZIERT

**Datum:** 2026-09-25 18:28
**Basis:** v0.4.0 Viewport 9x9

**Neu:**
- Spieler Richtung ^v + Pfeile (ohne JSX < > Conflict), dir State, tileChar mit dir
- RealMapView zeigt objects als M (NPCs) neben Warps O / Signs #, Legende angepasst, isObj && !isPlayer
- tileColor nur label/secondaryLabel (kein system* - vermeidet style Crash)
- GameView Titel zeigt dir, Karten-Info erweitert

**Verifikation:** tsc 0, vitest 21/92, RealMapView 9x9, Richtung sichtbar, NPCs.
