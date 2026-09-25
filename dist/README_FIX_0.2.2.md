# Fix 0.2.2 — index.tsx Text/Section Build-Fehler behoben

**Fehler gemeldet (0.2.1):**
```
/index.tsx [185,28]: Property 'color' does not exist on type 'IntrinsicAttributes & TextProps' (×5)
/index.tsx [205,18]: Type 'string' is not assignable to type '{ isInternal... }' (Section header string)
/index.tsx [207,19]: color ... (wieder)
/index.tsx [219,18]: Type 'string' is not assignable to type 'VirtualNode' (2. Section header)
/index.tsx [231,29]: color ...
Failed to build component. TypeError: undefined is not an object (evaluating 't.__type__')
```

**Ursache (VERIFIZIERT gegen offizielle Scripting Documentation.zip — helper_views.tsx + haptics/index.tsx + view_modifiers/padding):**
- `Text` hat kein `color` Prop — korrekt ist `foregroundStyle="secondaryLabel"` (siehe helper_views: `<Text foregroundStyle={"secondaryLabel"}>`). `color="secondary"` existiert nicht.
- `Section header` erwartet **VirtualNode** (`<Text>…</Text>`) nicht `string` — offizielle Beispiele: `<Section header={<Text>Status</Text>}>` (haptics, location, health...). Wir nutzten `header="Library — ..."` als String → Type-Fehler.
- `font="caption2"` ist gültig (kommt in mapkit Beispielen vor), aber zur Sicherheit auf `font="caption"` vereinheitlicht.

**Fix 0.2.2 (693K, index.tsx 14037→14005 Bytes, Top-Level Ordner gen1recomp/ bleibt):**
- Alle `color="secondary"` → `foregroundStyle="secondaryLabel"` (Zeilen 185-189, 207, 212, 231)
- Beide `Section header="..."` → `header={<Text>...</Text>}` (Library + Hinweise)
- `font="caption2"` → `font="caption"` (diagInfo) + `VStack alignment="leading"` explizit für Library-HStack
- Version bumps: `package.json` + `script.json` → `0.2.2`, Footer Text `v0.2.2 — Text/Section Fix`
- `tsc --noEmit` clean (außer scripting globals), `vitest` 92 Tests grün (21 Files), neu gepackt als `gen1recomp-v0.2.2.scripting` (693K, 57 Files, Top-Level Ordner `gen1recomp/` + `script.json` unverändert korrekt)

**Neue Dateien:**
- `gen1recomp-v0.2.2.scripting` (693K, fix) — im Branch, `dist/` und Root, importierbar via Tap
- `dist/README_FIX_0.2.2.md` (diese Datei)
- Alte 0.2.1 (693K, gleicher Zip aber mit broken index.tsx) bleibt als Negativ-Beispiel, nicht mehr nutzen

**Import jetzt:**
1. `gen1recomp-v0.2.2.scripting` nach Dateien → Tap → Teilen → Scripting → Import `gen1recomp v0.2.2` → `index.tsx` Play — sollte ohne Build-Fehler starten (kein `color` mehr, Section header korrekt). Danach wie gehabt: `ROM importieren (echt)` → `Daten prüfen`.
2. Falls weiterhin `Failed to build component`: In Scripting **Cache leeren** (App beenden, neu öffnen), erneut importieren — der `t.__type__` Fehler kam vom vorherigen `color`/`Section` Type-Mismatch, der den JSX Build abbrach.

**Verifikation:** `grep -n "color" index.tsx` → leer, `grep -n "foregroundStyle"` → 7 Treffer, `grep -n "Section header"` → beide mit `<Text>`.
