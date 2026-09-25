# Fix 0.3.1 — Mods Section Type + Stabilität — VERIFIZIERT

**Datum:** 2026-09-25 18:14
**Fehler nach 0.3.0:**
- `[Zeile 354, Spalte 13]: Type '""' is not assignable to type 'boolean | VirtualNode ...'`
- Anzeige garbled: `•p・ 15/35/50/75/1ST), nicht hard codiert` etc. — Mods Section rendert leer String statt null.

**Ursache:**
- `index.tsx:354` nutzte `{selectedId && <MapGrid ...>}` — wenn `selectedId` `""` (falsy string) liefert `&&` `""` zurück, aber Scripting JSX erlaubt nur `VirtualNode | boolean | null`, nicht `string ""`. `selectedId` ist `string | null`, leere String ist nicht erlaubt.
- Zudem `entries.find(...)` kann `undefined` liefern, `MapGrid` erwartet `entry: any` aber `undefined` ist nicht ideal.

**Fix 0.3.1:**
- `index.tsx:354` → `{selectedId ? <MapGrid entry={entries.find(e=>e.id===selectedId) ?? null} /> : null}` — garantiert `VirtualNode | null`, nie `""`.
- Version `0.3.0→0.3.1`, Footer aktualisiert, `tsc` wieder 0.

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0**
- `vitest run` → **21 Dateien 92 passed**
- `grep -n "selectedId ?"` → 354 vorhanden, kein `&&` mehr
- Staging `37 Dateien`, `dist/gen1recomp-v0.3.1.scripting` 697K, `Mods` Section rendern stabil, `MapGrid` nur wenn `selectedId` vorhanden

Behält: 0.3.0 Mods Voxel (DramaticShape, R.DIST), MapGrid, GameView, 0.2.7 etc.
