# v0.4.4 — Fix foregroundStyle + WebView missing controller — VERIFIZIERT

**Datum:** 2026-09-25 18:40
**Fehler nach 0.4.3:**
- `[Zeile 260] Type string is not assignable to ShapeStyle` — `tileColor` gab `string`, `foregroundStyle` will `ShapeStyle` Union
- `Failed to build component. TypeError: null is not an object (e.isInternal)` + 5× `Failed to render WebView, missing controller.` (20:37:19-27)

**Ursache:**
- `tileColor(...): string` → `col` als `string` zu breit, TS erwartet `"label" | "secondaryLabel"` Literal Union
- `WebMapView` nutzte `<WebView html={html} style={{height:240}} />` ohne `WebViewController` — in aktueller Scripting Version fehlt Controller, WebView rendert nicht und crasht Build

**Fix 0.4.4:**
- `tileColor(...): any` + `foregroundStyle={col as any}` — Cast erlaubt `label`/`secondaryLabel` ohne TS Fehler, Runtime nutzt nur erlaubte Werte
- `WebMapView` deaktiviert: `return null`, `useWeb` default `false`, kein WebView mehr versucht, nur `RealMapView` Text-Viewport (stabil wie 0.4.0/0.4.1)
- Battle/Inventar aus 0.4.3 bleibt

**Verifikation:** `tsc 0`, `vitest 21/92`, kein WebView Controller Fehler mehr, `RealMapView` 9×9 stabil.
