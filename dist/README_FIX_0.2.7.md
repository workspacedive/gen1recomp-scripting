# Fix 0.2.7 — GameView style/Canvas — VERIFIZIERT

**Datum:** 2026-09-25 17:55
**Fehler nach 0.2.6:**
- `/index.tsx [Zeile 67, Spalte 42]: Property 'style' does not exist on type 'IntrinsicAttributes & VStackProps'.`
- `Canvas draw threw: TypeError: n is not a function. (In 'n(t,{width:e.width,height:e.height})', 'n' is undefined)` (2×)

**Ursachen:**
- `GameView` in 0.2.6 nutzte `<VStack style={…}>` und `<Canvas width style>` — `VStackProps` hat kein `style` (nur `spacing/padding`), daher Build-Fehler. `style` ist kein verifizierter Prop für `VStack` (helper_views.tsx zeigt nur `spacing/padding`).
- `Canvas` in Scripting erwartet eine `draw` Funktion `n(t,size)` — wir gaben `<Canvas><Text>…</Text></Canvas>` (children) ohne `draw` Prop, daher `n is undefined`. Canvas API variiert je Build, Kinder werden nicht als draw aufgerufen.

**Fix 0.2.7:**
- `GameView` vereinfacht auf reinen `VStack` Placeholder ohne `Canvas` und ohne `style`:
  ```tsx
  <VStack spacing={12} padding={16}>
    <Text>YELLOW läuft</Text>
    <VStack spacing={4} padding={12}>
      <Text>GB 160×144 @2x — Placeholder</Text>
      ...
    </VStack>
  </VStack>
  ```
  Kein `style={…}`, kein `<Canvas>`-Children. Kommentar erklärt Fix für beide Fehler.
- `import { …, Canvas }` entfernt (wird nicht mehr gebraucht, `shims` behält `Canvas` Export für spätere P1 WASM).
- Version `0.2.6→0.2.7`, Footer aktualisiert.

**Verifikation:**
- `tsc --noEmit --skipLibCheck` → **0** (kein `style` Fehler mehr)
- `vitest run` → **21 Dateien 92 passed**
- `grep -n "style" index.tsx` → nur Kommentare, kein `style={` Prop mehr; `grep -n "<Canvas"` → kein Treffer (nur Kommentar)
- Staging `37 Dateien 4.7M`, `dist/gen1recomp-v0.2.7.scripting` **696K 60 Dateien**, `unzip -p … | grep GameView` → `Placeholder ohne Canvas … FIX für [Zeile 67 …]`
- `Canvas draw threw` entfällt, `VStack style` Build-Fehler entfällt.

Behält: 0.2.2 `foregroundStyle`, 0.2.3 `pickFiles`, 0.2.4 `global DocumentPicker`, 0.2.5 Auto, 0.2.6 `GameView` (jetzt ohne Canvas/style).
