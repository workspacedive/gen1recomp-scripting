# Pipeline Invariants — Formale Spezifikation (VERIFIZIERT)

> Quelle: `src/render/Pipelines.lua` (Engine) + `docs/modding.md` §Rendering pipelines (Doku) + `src/mods/Schemas.lua` `R.render_pipelines` + `mods/voxel_world` Beispiel.
> Gültig für `src/render/PipelineAdapter.ts` — jede Mod-Pipeline (inkl. Voxel) muss diese Invarianten erfüllen.

## 1. Typen

```
PipelineDef {
  label?: string
  levels?: string[]            // default ["OFF","ON"] ; voxel: ["OFF","15","35","50"]
  hotkey?: string              // z.B. "6" (nur Input)
  priority?: number            // default 0 ; höchste gewinnt
  available?: () => boolean    // jeden Frame ; false → 2D Fallback
  gate?: (top, overworld) => boolean  // nur Input-toggle
  update?: (dt, level) => void
  drawWorld?: (ctx: FrameCtx) => CanvasHandle | nil
  worldPresent?: (canvas, ctx) => CanvasHandle
  present?: (canvas, ctx) => CanvasHandle
  invalidate?: () => void
}

FrameCtx {
  state, cam {x,y}, vw, vh, width, height, scale, level,
  paletteFor(mapId), spriteColors(mapId),
  drawFx(project:(wx,wy)=>{x,y}, scale)  // Feld-Effekte unter eigener Projektion
}
```

`isCanvas(v)` = `v` besitzt `getWidth`+`getHeight` (userdata|table) — exakt wie `Pipelines.lua`.

## 2. Invarianten

### I1 — Priority

`list()` sortiert `priority` absteigend, bei Gleichstand `id` lexikographisch. `worldPipeline()` gibt die **erste** `eligible` mit `drawWorld` zurück.

### I2 — eligible

```
eligible(id) = level[id] > 0  ∧  !broken[id]  ∧  (available==nil ∨ available()==true)
```

`gate` wird **nie** für `eligible` geprüft. `available` wird **jeden Frame** neu gerufen und per `guard` gegen Throw geschützt.

### I3 — gate nur Input

`gate(top, overworld)` wird nur in `canToggle(id, top, overworld)` und damit nur bei `hotkey`/`cycle` geprüft. `drawWorld`/`worldPresent`/`present` rufen `gate` nie. Default `gate` = `Zoom.gateOK` ≈ `overworld.isFreeRoam`.

### I4 — drawWorld Vertrag

`drawWorld(ctx)` darf `CanvasHandle` oder `nil` zurückgeben. `nil` **oder** nicht-`isCanvas` → Engine nutzt vanilla 2D. Throw → `broken[id]=true`, attribuiert an `_owners[id]`, einmal loggen, danach nie wieder aufrufen, **nie** Crash. Vor und nach jedem `drawWorld` gilt `push("all")`/`pop()` State-Fence (in Scripting: `save`/`restore` + `resetTransform`) — balanciert auch bei Throw.

### I5 — worldPresent / present Faltung

```
cur = worldCanvas
for id in listSortedByPriority():
  if def.worldPresent && eligible(id):
    out = guardRender(id, ()=> def.worldPresent(cur, ctx))
    if isCanvas(out) cur = out
// analog present über alle eligible with present
```

Jeder Schritt ist `isCanvas`-geprüft und `broken`-geschützt.

### I6 — Tilt ↔ Welt-Pipeline Exklusivität

Wenn `level[id] > 0` für ein `id` mit `drawWorld`, wird `tilt` auf `0` gesetzt und alle anderen `drawWorld` Pipelines auf `0` zurückgesetzt (`excludeTilt`). Umgekehrt setzt `tilt != 0` alle Welt-Pipelines auf `0`. Nur **eine** Welt-Pipeline ist aktiv.

### I7 — Levels Persistenz

`levels` leben in `memory` + `save.options.pipelines` (via `syncOptions`/`applyOptions`). `maxLevel(id) = levels.length - 1`. `cycle(id, dir)` wrappt `[-1]` und `>max`.

### I8 — invalidate

`invalidate()` ruft `def.invalidate()` für jede Pipeline via `guardRender`. Throw → `broken`. Bei Resize/Resolution-Wechsel muss `invalidate()` gerufen werden, um GPU-/Image-Cache zu leeren.

### I9 — Performance Budget (Scripting-spezifisch, BENCHMARK ERFORDERLICH)

`drawWorld` Budget 6–8 ms, `worldPresent` 2–3 ms, `present` 1–2 ms (p95). Bei Überschreitung stuft `AdaptivePerformanceManager` LOD ab (`50→35→15→OFF`) und schaltet `worldPresent` ab. Telemetry: `drawWorldMs`, `worldPresentMs`, `triangles`, `availableFalseFrames`, `broken[]`.

### I10 — WebView Dual-Backend (EXPERIMENTELL)

Für Voxel gilt zusätzlich:
- Canvas2D Fallback ist **immer** `available()==true` wenn Canvas existiert.
- WebView-WebGL Probe `isWebGL2AvailableInWebView()` wird gecacht, durch `invalidate()` gelöscht.
- `drawWorldSync` liefert `warm` synchron oder `null` (Fallback 2D); im Hintergrund wird der nächste Frame via `postMessage` vorgewärmt.
- Asset-Limits: 8 MiB per `mod.cache:write`, 64 MiB cap, 512 MiB `mod.storage:writeBytes` staged+verified.

## 3. Testabdeckung

`src/render/PipelineAdapter.test.ts` prüft I1–I9 (priority, eligible/gate Trennung, worldPipeline, isCanvas, throw→broken, worldPresent/present Faltung, hotkey/gate, excludeTilt, levels wrap, sync/apply, invalidate, push/pop Fence).
`src/render/VoxelBackends.test.ts` prüft I10 (LOD Mapping, cacheKey, Limits, Warm Cache).

## 4. Fehlerfälle

| Fall | Erwartetes Verhalten | Test |
|------|----------------------|------|
| Headless (`available()==false`) | 2D Fallback, kein Crash | I2 |
| Vergessener `return` (`nil`) | Fallback 2D | I4 |
| Throw in `drawWorld` | `broken`, Fallback 2D, attribuiert | I4 |
| Resize | `invalidate()` leert Cache | I8 |
| `pressureLevel critical` | LOD Downgrade, schließlich OFF | I9 |
