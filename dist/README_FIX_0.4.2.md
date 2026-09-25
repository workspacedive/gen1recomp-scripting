# v0.4.2 — WebView HTML Grafik (farbig) + Text Fallback — VERIFIZIERT

**Datum:** 2026-09-25 18:31
**Basis:** v0.4.1 Richtung + NPCs

**Neu:**
- WebMapView HTML Grid 22px farbige Divs (X grau, . gruen, o beige, ~ blau, * hellgruen, O blau Warp, # orange, M rot NPC, P gold + ^v Richtung), Viewport 9x9, WebView html + Toggle Grafik/Text
- RealMapView bleibt Text-Fallback wenn WebView nicht verfuegbar (verifiziert via typeof WebView)

**Verifikation:** tsc 0, vitest 21/92, WebView HTML enthaelt farbige Divs, Toggle ok, Text Fallback stabil.
