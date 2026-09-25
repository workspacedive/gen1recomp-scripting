# v0.4.5 — Entfernt WebView + Fix Build e.isInternal — VERIFIZIERT

**Datum:** 2026-09-25 18:46
**Fehler nach 0.4.4:**
- `20:43:35 Failed to build component. TypeError: null is not an object (e.isInternal)` — trotz WebMapView return null
- Weiter `foregroundStyle` Type Fehler 260,31

**Ursache:**
- `import { WebView }` allein laesst Scripting Bundler WebView initialisieren, fehlender Controller -> `e` null -> `e.isInternal` Crash, selbst wenn Komponente nicht gerendert wird
- `tileColor` string zu breit

**Fix 0.4.5:**
- `WebView` aus `import` entfernt, `WebMapView` + `useWeb` + Toggle komplett entfernt, nur `RealMapView` Text
- `tileColor(...): any` + `foregroundStyle={col as any}` bleibt, `tsc 0`

**Verifikation:** tsc 0, vitest 21/92, build ok, kein WebView mehr.
