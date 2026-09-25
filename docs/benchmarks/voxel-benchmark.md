# Voxel Dual-Backend Benchmark Plan — BENCHMARK ERFORDERLICH

> Ziel: entscheiden ob WebView-WebGL (Three.js) gegenüber Canvas 2D Fallback messbaren Vorteil bringt, ohne Stabilität/Batterie zu opfern. Entscheidung blockiert Default-Umschaltung.

## 1. Hypothesen

- H1: Canvas 2D isometrisch/Billboarding erreicht p95 drawWorld <6 ms auf iPhone SE (2nd) + iPhone 15, dafür visuell flacher (kein echter Depth, kein Schatten).
- H2: WebView WebGL (Three.js Slim, LOD 8/16/32, Frustum Culling) erreicht p95 8–12 ms auf iPhone 15, 14–20 ms auf SE, visuell deutlich besser (Depth, Schatten bei 50), aber höherer RAM (+~30 MiB WebView Prozess) und Batterie.
- H3: Warm Cache (1 Frame voraus) eliminiert async-Stall: `drawWorldSync` liefert 95 % der Frames synchrones warm hit.

## 2. Setup (Non-Pro, App Store)

- **Geräte:** iPhone SE 2022 (untere Schranke), iPhone 13 (mittel), iPhone 15 Pro (oben). Alle iOS 17+.
- **Build:** Scripting aus App Store 2026-07-01, kein Pro, `Host.graphics = ScriptingGraphicsAdapter` (Canvas 2D + WebView WebGL Probe).
- **Mod:** `mods/voxel_world` Diorama + Community Voxel Pack (falls vorhanden) mit `levels=["OFF","15","35","50"]`.
- **Maps:** Pallet Town, Viridian Forest, Cerulean Cave (klein/mittel/groß, verschiedene Tile-Sets).
- **Profile:** Jeder Level OFF/15/35/50, jeweils 5 Min Walk (Overworld), 2 Min Tilt.

## 3. Metriken (in Performance Intelligence Layer)

| Metrik | Quelle | Einheit | Ziel Canvas | Ziel WebGL |
|--------|--------|---------|-------------|------------|
| `drawWorldMs` p50/p95/p99 | `TimingPort.now()` um `PipelineAdapter.drawWorld` | ms | p95 <6 | p95 <12 (15 Pro), <16 (SE) |
| `worldPresentMs` p95 | um `worldPresent` | ms | <2 | <3 |
| `triangles` | `VoxelBackends` Zähler | # | — | 5k (15) / 12k (35) / 25k (50) |
| `cacheHitWarm` | `WebViewVoxelBackend.warm` hit rate | % | — | >90 % |
| `availableFalseFrames` | `available()`==false Zähler | % Frames | 0 | <5 % (Headless) |
| `memoryPeak` | `estimate()` | MiB | <80 | <120 (inkl. WebView) |
| `batteryDelta` | iOS Settings (heuristisch) | %/h | baseline | <+15 % vs Canvas |
| `frameTime` p95 | `TimingPort` FixedStep | ms | <16 | <16 |
| `brokenCount` | `broken[]` | # | 0 | 0 |

## 4. Ablauf

1. **Baseline Canvas:** WebGL Probe forcieren `false` (NoopGraphicsAdapter), `level=50`, 5 Min messen → Baseline.
2. **WebGL Probe `true`:** ScriptingGraphicsAdapter, `level=15`, dann 35, dann 50, je 5 Min.
3. **Warm Cache Messung:** `drawWorldSync` Null-Rate in ersten 10 s vs danach.
4. **Pressure:** `MemoryPort.pressureLevel` `warning` simulieren (große Cache Fill), prüfe LOD Downgrade 50→35→15→OFF.
5. **Resize:** Rotation 0°→90°→0°, prüfe `invalidate()` und `availableFalseFrames`.
6. **Offline:** Flight Mode, prüfe dass `prepared_asset` Cache Voxel noch rendert (kein Netz).

## 5. Entscheidungskriterium

- WebView wird **Default erst ab 35** wenn:
  - `drawWorldMs p95` WebGL <12 ms auf iPhone 13 **und** visuelles Rating (5-Person Blindtest) >7/10 vs Canvas 6/10
  - `brokenCount`==0 über 30 Min, `cacheHitWarm`>85 %, `memoryPeak` unter `critical` Schwelle
  - Battery-Rate <+20 % vs Canvas

- Sonst bleibt **Canvas 2D Default**, WebGL als Opt-in im `LaunchProfile.graphics.quality` (`quality: high` → WebGL wenn Probe true).

## 6. Durchführung Jetzt (im Simulator / ohne Gerät)

- **Simulator Benchmark (vitest bench):** `src/render/bench/voxel.bench.ts` (falls vorhanden) — misst nur CPU-Anteil `drawWorld` Logik ohne echten GPU, als Proxy. `BENCHMARK ERFORDERLICH` auf echtem Gerät markiert.
- **Manueller Test Checkliste:** im PR Beschreibung abhaken.

## 7. Instrumentierung (bereits implementiert)

- `PipelineAdapter.drawWorld` um `timing.now()` wrappen → `drawWorldMs` in `Performance Intelligence Layer` loggen.
- `VoxelBackends` `triangles` als Debug Overlay (Canvas Text).
- `invalidate()` zählt Aufrufe.
- Telemetry in `Storage` (`telemetry:voxel:{device}:{level}:{metric}`) für spätere Auswertung.
