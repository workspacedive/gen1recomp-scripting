/**
 * ResourceGovernor — generische Budget-Verwaltung + Voxel LOD Downgrade
 * Quelle: docs/ARCHITEKTUR.md §37 Memory Management, §30 AdaptivePerformance, §66 ResourceGovernor
 * Entdeckt parallel während Voxel-Arbeit: Voxel ist Last-Treiber, Governor muss voxelBudget kennen.
 *
 * Policies:
 * 1. tmp löschen
 * 2. Preload cancel/evict
 * 3. Voxel LOD 50→35→15→OFF (via PipelineAdapter levels)
 * 4. Cache LRU sweep
 * 5. Effekte aus
 * 6. Jobs pausieren
 * 7. Gameplay+Saves nie evict
 */

import type { MemoryPort } from "../host/ports"
import type { PipelineAdapter } from "../render/PipelineAdapter"
import type { PipelineTelemetry } from "../telemetry/PipelineTelemetry"

export type PressureLevel = "normal"|"warning"|"critical"

export type GovernorPolicy = {
  voxelBudgetMs: number // z.B. 8ms
  enableTelemetryDowngrade: boolean
}

export class ResourceGovernor {
  private pressure: PressureLevel = "normal"

  constructor(
    private pipelines: PipelineAdapter,
    private telemetry: PipelineTelemetry,
    private memory?: MemoryPort,
    private policy: GovernorPolicy = { voxelBudgetMs: 8, enableTelemetryDowngrade: true },
  ) {}

  setPressure(level: PressureLevel): void { this.pressure = level }

  // Aus MemoryPort lesen falls vorhanden — sonst gesetzten pressure nutzen
  async refreshPressure(): Promise<PressureLevel> {
    if (this.memory?.pressureLevel) {
      try { this.pressure = this.memory.pressureLevel() } catch {}
    }
    return this.pressure
  }

  // Haupt-Tick: pro Frame aufrufen (z. B. aus PerformanceManager)
  // Gibt zurück ob downgraded wurde und auf welches Level
  tickVoxelLOD(): { downgraded: boolean; from?: number; to?: number; reason: string } | null {
    const wp = this.pipelines.worldPipeline()
    if (!wp) return null // keine Welt-Pipeline aktiv → nichts zu tun

    const lvl = this.pipelines.level(wp)

    // 1. Memory pressure → sofort downgrade
    if (this.pressure === "critical") {
      if (lvl > 0) {
        this.pipelines.setLevel(wp, 0)
        this.telemetry.markBroken(wp) // signal für Diagnostics: critical evict
        return { downgraded: true, from: lvl, to: 0, reason: "critical memory" }
      }
      return null
    }
    if (this.pressure === "warning") {
      const downgradeMap: Record<number, number> = { 3:2, 2:1, 1:0, 0:0 } // 50→35→15→OFF
      const next = downgradeMap[lvl] ?? 0
      if (next < lvl) {
        this.pipelines.setLevel(wp, next)
        return { downgraded: true, from: lvl, to: next, reason: "memory warning" }
      }
    }

    // 2. Telemetry Budget Überschreitung → LOD Downgrade (nur wenn warning/normal, nicht critical schon behandelt)
    if (this.policy.enableTelemetryDowngrade && this.telemetry.shouldDowngrade(wp, this.policy.voxelBudgetMs)) {
      const map: Record<number, number> = { 3:2, 2:1, 1:0 }
      const next = map[lvl]
      if (next !== undefined && next < lvl) {
        this.pipelines.setLevel(wp, next)
        return { downgraded: true, from: lvl, to: next, reason: `telemetry p95 > ${this.policy.voxelBudgetMs}ms` }
      }
    }

    return null
  }

  // Upgrade nur wenn sustained good performance (5 frames) + pressure normal — hier vereinfacht: manuell
  tryUpgradeVoxelLOD(): { upgraded: boolean; from:number; to:number } | null {
    if (this.pressure !== "normal") return null
    const wp = this.pipelines.worldPipeline()
    // Wenn worldPipeline null aber eine voxel Pipeline existiert mit load? Wir brauchen worldPipeline aktiv zum Upgraden
    // Stattdessen: suche irgendeine pipeline mit levels OFF/15/35/50 die gerade 0 ist und früher war — hier simpel: wenn kein worldPipeline, nimm höchste priority mit level 0 und available true
    let target: string | null = wp
    if (!target) {
      for (const {id} of this.pipelines.list()) {
        const def = this.pipelines.get(id)
        if (def?.drawWorld && this.pipelines.eligible(id) === false && this.pipelines.level(id)===0) {
          // eligible false weil level 0, aber available true → könnte upgraden
          const avail = def.available ? (()=>{ try{ return def.available!()}catch{return false}})() : true
          if (avail) { target = id; break }
        }
      }
    }
    if (!target) return null
    const lvl = this.pipelines.level(target)
    const s = this.telemetry.stats(target, "drawWorld")
    // Nur upgraden wenn p95 deutlich unter Budget (budget -2ms) und genug Samples
    if (s.count >= 10 && s.p95 < this.policy.voxelBudgetMs - 2) {
      const upMap: Record<number, number> = { 0:1, 1:2, 2:3 }
      const next = upMap[lvl]
      if (next !== undefined) {
        this.pipelines.setLevel(target, next)
        return { upgraded: true, from: lvl, to: next }
      }
    }
    return null
  }
}
