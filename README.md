# gen1recomp-scripting

**Gen1Recomp → Scripting iOS (Scripting.fun) — Architektur & Portierung**

> **Ziel:** Keine Minimal-Portierung, sondern eine robuste, modulare, performante, sichere, wartbare **Game-Runtime für iOS** — **ohne Scripting Pro**, Offline-First, mit sauberem Rollback, Save-Migration, Caching, Preloading, Diagnostics.

**Branch:** `arena/01a0d91d-gen1recomp-scripting` — alle Arbeit hier.  
**Stand:** 2026-09-25 • **Basis:** `bryanthaboi/gen1recomp@2ea74fa` + `ScriptingApp/ScriptingApp.github.io` (App Store 2026-07-01)

---

## Was hier liegt

| Pfad | Inhalt | Status |
|------|--------|--------|
| `docs/ARCHITEKTUR.md` | **Hauptdokument** — 77 Kapitel, 70 Risiko/Re­covery/Compat-Matrizen, 10 Mermaid-Diagramme, alle 46 Endresultat-Punkte, P0–P3 Roadmap, ADRs, Abnahmekriterien | **VERIFIZIERT/TEILWEISE** je Behauptung |
| `SKILLS.md` | Wiederverwendbare Skills (gen1recomp-audit, scripting-host-audit, host-adapter-design …) — jeder mit Input/Output/Status, ohne Pro | VERIFIZIERT |
| `AGENT.md` | 8 Agent-Rollen (principal-architect, reverse-engineer, ios-runtime-specialist …) + Orchestrierung + Pro-Ausschluss-Check | VERIFIZIERT |
| `src/host/ports.ts` | **Host Adapter — Ports** (Storage, Files, Network, Graphics, Audio, Input, Lifecycle, Memory, Jobs, Timing, Haptics, Permissions) — strikt hexagonal | VERIFIZIERT |
| `src/host/ScriptingAdapter.ts` | **Scripting Adapter** — konkrete Implementierungen (FileManager, Storage/SQLite, fetch, Thread, Timeline) — nur App-Store-APIs, graceful degradation | VERIFIZIERT |
| `src/library/GameLibrary.ts` | Game Library — einmaliger Import (SHA-1, Deduplizierung, CacheContract, FileManager) | VERIFIZIERT |
| `src/coreStore/CoreStore.ts` | Versionierter Core Store (staged→verified, LKG, Retention) | VERIFIZIERT |
| `index.tsx` | **Scripting Entry** — `Navigation.present(<App />)` demonstriert Library + Core Store (DocumentPicker, Warm Start) | Non-Pro |

---

## Quick Start (Scripting App)

1. Projekt in Scripting importieren (Ordner `gen1recomp-scripting`).
2. `index.tsx` als Entry öffnen.
3. **ROM importieren** → `DocumentPicker` → SHA-1 geprüft (nur US Red/Blue/Yellow/Gold/Silver/Crystal/FireRed/LeafGreen) → `library/<id>/generated/rom-cache.complete` + Index.
4. Danach: **Library → Spielen** ohne erneuten Pick (Warm Start).
5. **Core** via `CoreStore` installieren (staged→health→verified, Rollback zu LKG).

Kein Pro erforderlich. Keine ROM-Distribution im Repo.

---

## Verifikation

Jede Behauptung trägt Status: `VERIFIZIERT` / `TEILWEISE VERIFIZIERT` / `NICHT VERIFIZIERT` / `EXPERIMENTELL` / `BENCHMARK ERFORDERLICH`.  
Quellenpriorität: Quellcode > offizielle Doku > Releases > Tests > Standards.

**Gen1Recomp Audit:** `mobile/ios/README.md` (Documents Root, `gen1recomp++://`), `conf.lua` (t.version 12.0 iOS), `src/core/FixedStep.lua` (60/59.73 Hz), `CacheContract.lua` (v12/v17), `src/mods/*` (Manifest v2, Hooks, Events, Sandbox).  
**Scripting Audit:** `Scripting Documentation.zip` entpackt — `FileManager`/`Storage`/`Thread`/`fetch`/`Canvas`/`AVPlayer`/`SQLite`/`DocumentPicker` **VERIFIZIERT**, `WASM`/`WebGL`/`SharedArrayBuffer` **NICHT VERIFIZIERT** → Fallback `fengari` (Lua-in-JS).

---

## Architektur-Prinzip

```
Original Gen1Recomp
      ↓
Adapter / Wrapper / Host Layer   ← Ports definieren Verträge
      ↓
Scripting-iOS Integration (FileManager, Canvas, AVPlayer, Storage, fetch, SQLite, Thread)
      ↓
Library / Core / Mod / Cache / Recovery Layer
```

Bounded Contexts: 28 (Host Adapter, Library, Identity, Storage, Core Store, Launch Profiles, Compatibility, Update, Recovery, Save, Migration, Cache, Resource, Preload, Performance …) — siehe `docs/ARCHITEKTUR.md` §8.

---

## P0 Roadmap (ohne Pro)

1. Audit & Host Adapter (erledigt — dieses Repo)
2. Library & Core Store (Scaffold vorhanden, Verifikation gegen echten ROM nötig)
3. Mods & Saves (Sandbox + DependencyGraph + Atomic Save)
4. Recovery & Updates (Journal + Rollback)
5. Grafik/Audio/Input auf Canvas/AVPlayer
6. Performance (Governor + Benchmarks) → dann Predictive Preload

WASM nur als Benchmark-Track in `WebView` (`NICHT VERIFIZIERT`).

---

## Lizenz / Legal

- Gen1Recomp: siehe dort `LICENSE.MD` — hier nur **Runtime**, nie **ROM/Game Data** distribuieren. ROM wird user-provided via `DocumentPicker`, SHA-1 verifiziert, nie kopiert.
- Scripting: App Store, kein Pro-Zwang.
- Technisch strikt getrennt: `Runtime ≠ Game Data ≠ Mods ≠ Patches`.

---

## Skills & Agents nutzen

```ts
// Skills explizit aufrufen (siehe SKILLS.md)
import { SkillRunner } from "./src/host/SkillRunner"
await SkillRunner.run("gen1recomp-audit", { checkout: "/tmp/gen1recomp" })
```

Agents siehe `AGENT.md` — principal-architect orchestriert, ios-runtime-specialist prüft Pro-Flag vor jeder API-Nutzung.
