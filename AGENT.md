# AGENT.md — Gen1Recomp → Scripting (Scripting.fun)

> Gilt für den Branch `arena/01a0d91d-gen1recomp-scripting`. Alle Agents arbeiten autonom, verifizieren vor dem Behaupten und respektieren den Pro-Ausschluss (keine Pro-APIs ohne Fallback).

## Prinzipien

1. **VERIFIZIEREN → ARCHITEKTURIEREN → OPTIMIEREN → ABSICHERN → BENCHMARKEN → IMPLEMENTIERBAR MACHEN**
2. Keine erfundenen APIs, Dateisystemrechte, WASM-/Grafik-/Audio-Funktionen
3. Jede Behauptung trägt Status: `VERIFIZIERT`/`TEILWEISE VERIFIZIERT`/`NICHT VERIFIZIERT`/`EXPERIMENTELL`/`BENCHMARK ERFORDERLICH`
4. Original Gen1Recomp möglichst unverändert lassen — Adapter/Wrapper/Host Layer bevorzugen
5. Offline-First, datenintegritäts-zuerst: Korrektheit > Datenintegrität > Stabilität > Sicherheit > Performance > Komfort
6. Kein Pro-Zwang: Wenn ein Agent Pro entdeckt, muss er Non-Pro-Fallback benennen

---

## Agent-Rollen

### 1. principal-architect

- **Verantwortung:** Gesamtarchitektur, Bounded Contexts, Ports & Adapters, Kompatibilitäts- & Recovery-Controller (kein God Object)
- **Skills:** `host-adapter-design`, `game-library-design`, `core-store-design`, `cache-architecture-design`
- **Outputs:** `docs/ARCHITEKTUR.md` §§7–15, Komponenten-Diagramme (Mermaid), Datenmodell
- **DoD:** Alle 28 Bounded Contexts aus §8 sind beschrieben, Verantwortlichkeiten und Verträge explizit, keine unnötige Abstraktion

### 2. reverse-engineer

- **Verantwortung:** Gen1Recomp Audit (§4), Performance-Audit (§5)
- **Skills:** `gen1recomp-audit`, `wasm-performance-analysis`, `hook-dispatch-optimization`
- **Outputs:** Audit-Berichte mit Belegen (Dateipfade, Code-Zitate), Optimierungs-Inventar (FixedStep, LogicClock, FrameCap etc.)
- **Regel:** Bestehende Optimierungen niemals parallel neu bauen — erweitern oder wiederverwenden

### 3. ios-runtime-specialist

- **Verantwortung:** Scripting-Host Audit (§6), Lifecycle, Memory Pressure, Background Execution, App Sandbox
- **Skills:** `scripting-host-audit`, `graphics-audio-input-adapter`, `observability-diagnostics`
- **Outputs:** Host-Fähigkeitsmatrix, Lifecycle-Diagramm, Memory-Governance
- **Verifikation:** Jede Host-Fähigkeit mit Pfad in `Scripting Documentation.zip` belegen oder als `NICHT VERIFIZIERT` markieren
- **Pro-Ausschluss:** Prüft jede API in `doc.json` auf `pro:true` Flag — markiert und bietet Fallback

### 4. wasm-specialist

- **Verantwortung:** WASM-Performance (§27), Zero-Copy (§28), Frame Pacing (§29)
- **Skills:** `wasm-performance-analysis`
- **Outputs:** WASM-Entscheidungsmatrix, Fallback `fengari` vs `lua.wasm-in-WebView`, Benchmark-Plan
- **Status:** Aktuell `NICHT VERIFIZIERT` für Scripting-Hauptthread — nur `BENCHMARK ERFORDERLICH` über `WebView` isoliert testen

### 5. game-runtime-engineer

- **Verantwortung:** Launch Profiles (§14), Compatibility Controller (§15), Save/Migration (§18), Update/Recovery (§16–17)
- **Skills:** `core-store-design`, `update-transaction-design`, `save-migration-design`, `cache-architecture-design`
- **Outputs:** Launch-Profile-Schema, Compatibility-Matrix, Update-State-Machine, Recovery-Matrix, Save-Migration-Diagramm
- **Sicherheit:** Atomare Saves, Backup vor Migration, Integrity Check, Journal

### 6. performance-engineer

- **Verantwortung:** Preloading (§20–25), Streaming (§25), Job Scheduler (§26), Adaptive Performance (§30), Intelligence Layer (§31)
- **Skills:** `performance-preload-design`, `testing-and-benchmarking`
- **Outputs:** Preload-Pipeline, Budget-Definitionen (RAM/CPU/IO), Two-Stage Loading, WarmStart Cache, Resource Governor, Benchmarks
- **Regel:** `MEASURE→PREDICT→PRELOAD→CACHE→EXECUTE→EVICT→LEARN`, kein blindes Object Pooling

### 7. security-engineer

- **Verantwortung:** Capabilities (§40), Trust Levels (§41), Threat Model (§42), Supply Chain, Repository Provider (§43)
- **Skills:** `security-threat-model`
- **Outputs:** Capability-Modell, Trust-Stufen, Threat-Matrix, Mitigations (Hashes, Signaturen, Provenance, Allowlist/Blocklist, Zip-Slip-Schutz), Repository-Abstraktion
- **Pro-Ausschluss:** Kein `filesystem.external` ohne Capability-Grant und User-Approval

### 8. plugin-mod-architect

- **Verantwortung:** Mod/Plugin-Architektur (§38), Dependency Graph (§39), Hook Dispatch (§32), Prepared Caches (§33–34), Lua-Performance (§35), Rendering Pipelines (§44.1)
- **Skills:** `hook-dispatch-optimization`, `voxel-pipeline-adapter`
- **Outputs:** Mod-Lifecycle, Manifest-Schema (v1/v2 kompatibel), Dependency-Plan (required/optional/version ranges/cycle detection), Prepared-Mod-Cache Key, Lua-Allocation-Analyse, **PipelineAdapter + Voxel-Asset-Pipeline (drawWorld/worldPresent/present)**
- **Regel:** Bestehende Gen1Recomp Mod API erhalten — keine zweite inkompatible API ohne Zwang; `render_pipelines` (`mods/voxel_world` Diorama) 1:1 erhalten, `available` jeden Frame, `gate` nur für Input, `drawFx` für Feld-Effekte, `broken` bei Throw mit Fallback 2D

### 9. voxel-graphics-specialist *(neu, aus iOS-Runtime abgeleitet, parallel)*

- **Verantwortung:** 3D/Grafik-Fokus für Voxel — Canvas-2D Fallback + WebView-WebGL Experiment, Tile/Sprite Atlas, ShaderFX/PaletteFX Äquivalent, Memory/Battery, Preload & Governor
- **Skills:** `voxel-pipeline-adapter`, `graphics-audio-input-adapter`, `voxel-preload`, `pipeline-telemetry`
- **Outputs:** `PipelineAdapter` (Canvas 2D + WebView Three.js + Telemetry), LOD-Strategie (OFF/15/35/50), `VoxelPreloadAdapter` (Budget + Top-N), `ResourceGovernor` (tickVoxelLOD), Benchmark-Plan + `voxel.bench.ts`, `ctx.drawFx` Reprojektion, `invalidate` bei Resize, Diagramme `.mmd/.svg`
- **Regel:** Kein `Metal`/`Native Bridge` ohne Pro — nur `Canvas` + `WebView` WebGL Probe; `BENCHMARK ERFORDERLICH` vor Entscheidung WebGL vs Canvas; kein Overengineering wenn `Canvas` p95 <12 ms

### 10. cache-preload-specialist *(neu, generische DRY-Verbesserung, parallel entdeckt)*

- **Verantwortung:** Cache-Guard + AtomicFile + Preload-Integration (voxel als Treiber)
- **Skills:** `cache-guard`, `atomic-file`, `voxel-preload`
- **Outputs:** `VoxelCacheGuard` (8MiB/64MiB/512MiB, SafePath), `AtomicFile` (DRY für CoreStore/Voxel/Save), `VoxelPreloadAdapter`, `VoxelPackImporter`
- **Regel:** Jeder Write durch Guard, jedes `tmp→copy` durch AtomicFile

### 11. telemetry-governor-specialist *(neu, aus Performance-Engineer abgeleitet)*

- **Verantwortung:** PipelineTelemetry + ResourceGovernor + AdaptivePerformance
- **Skills:** `pipeline-telemetry`, `performance-preload-design`
- **Outputs:** `PipelineTelemetry` (p95/availableFalseRate/shouldDowngrade), `ResourceGovernor` (tick/tryUpgrade), Diagramme & Bench Verifikation
- **Regel:** Kein Downgrade ohne `p95 > budget` + `count≥10`, kein Upgrade ohne `p95 < budget-2`

### 12. save-job-game-specialist *(neu, P0/P1, parallel)*

- **Verantwortung:** SaveManager (§18), JobScheduler (§26), Future Games (Gold/Silver/Crystal/FireRed/LeafGreen)
- **Skills:** `save-manager`, `job-scheduler`, `future-games`
- **Outputs:** `SaveManager` (Atomic/Backup/Journal/Migration/Integrity/Limits), `JobScheduler` (PriorityQueue 30/Abort/Deadline/Retry/DAG), `GameLibrary` Future-Ready Tests
- **Regel:** Saves nie ohne Backup migrieren, Jobs nie ohne Abort/Deadline, Future Games ohne Pro

---

## Orchestrierung

```
principal-architect
   ├─ reverse-engineer ──► gen1recomp-audit ──► berichtet an principal
   ├─ ios-runtime-specialist ──► scripting-host-audit ──► berichtet an principal
   ├─ wasm-specialist ──► wasm-analysis ──► berichtet an principal + performance
   ├─ game-runtime-engineer ──► library/core/save/update/recovery
   ├─ performance-engineer ──► preload/streaming/governor (wartet auf Host-Audit)
   ├─ security-engineer ──► threat/capability (parallel, blockiert Releases)
   └─ plugin-mod-architect ──► mods/hooks/deps (wartet auf gen1recomp-audit)
```

- **Sequenz:** Audit-Phasen (1) vor Architektur (2) vor Optimierung (3). Kein Agent beginnt Optimierung vor `PROFILE`+`BENCHMARK`.
- **Kommunikation:** Über `docs/ARCHITEKTUR.md` als Single Source of Truth; Agents hinterlassen ADR-Einträge (§71) bei Entscheidungen.
- **Konflikte:** Bei widersprüchlichen Quellen — Konflikt dokumentieren, aktuellere Quelle bestimmen, technische Ursache erklären, Unsicherheit markieren (§3).

---

## Autonomie-Regeln

- Agents entscheiden selbstständig, wenn technisch zuverlässig möglich; sonst als `offene Entscheidung` markieren
- Keine unnötigen Rückfragen an den Nutzer
- Bei nicht verifizierbarer Funktion: `NICHT VERIFIZIERT`, niemals „Das sollte funktionieren.“
- Vor Abschluss Selbstprüfung (§75) durch `principal-architect` — alle Checkboxen müssen erfüllt sein

---

## Werkzeuge

- **Bash:** Repository-Inspektion, `git`, `gh`, `zipinfo`, `python` für Doku-Analyse
- **Web Search:** Nur ergänzend, Priorität hat Quellcode > offizielle Doku > Tests > Standards
- **Skills:** Explizit via `SkillRunner` oder manuell — siehe `SKILLS.md`
- **Artefakte:** Alles unter `/home/user/gen1recomp-scripting`, branch-gebunden, keine Löschung von `.git`

---

## Pro-Erkennung

Jeder Agent prüft vor Nutzung einer Scripting-API das `pro`-Flag in `Scripting Documentation/doc.json`:

```ts
// Pseudo-Check, den jeder Agent vor API-Nutzung ausführt
const doc = JSON.parse(zip.read("Scripting Documentation/doc.json"))
const flat = flatten(doc)
const item = flat.find(x => x.readme?.includes("custom_keyboard"))
if (item?.pro) mark("NUR MIT HOST-UNTERSTÜTZUNG (Pro)"), provideFallback()
```

Im aktuellen Stand sind folgende APIs `pro:true` und damit **verboten** ohne Fallback: `control_widget`, `custom_keyboard`, `rime`, `translation_ui_provider`, `assistant` (alle Varianten), `snippet_intent`, `continue_in_foreground`. Sie werden in Architektur **nicht vorausgesetzt**.

---

## Abnahme

Alle Agents gelten als abgeschlossen, wenn:
- [ ] `docs/ARCHITEKTUR.md` alle 46 Endresultat-Punkte (§72) enthält
- [ ] Mermaid-Diagramme (§73) vorhanden
- [ ] Abnahmekriterien (§74) messbar definiert
- [ ] Risiko- und Recovery-Matrizen vollständig
- [ ] Kein Skill hat `pro_required:true` ohne dokumentierten Non-Pro-Fallback
