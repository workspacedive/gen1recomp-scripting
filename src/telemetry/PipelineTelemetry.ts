/**
 * PipelineTelemetry — collects drawWorld/worldPresent/present timings + voxel metrics
 * Parallel-Verbesserung entdeckt während Voxel-Arbeit: Telemetry fehlte für Pipeline-Budgets
 * Nutzt TimingPort + StoragePort (generisch), kein Pro.
 */

import type { TimingPort, StoragePort } from "../host/ports"

export type PipelineSample = {
  ts: number
  id: string
  stage: "drawWorld"|"worldPresent"|"present"
  ms: number
  level: number
  triangles?: number
  available: boolean
}

export type PipelineStats = {
  p50: number; p95: number; p99: number
  count: number
  broken: string[]
  availableFalseRate: number
}

export class PipelineTelemetry {
  private samples: PipelineSample[] = []
  private broken = new Set<string>()
  private availableFalse = 0
  private totalEligibleChecks = 0

  constructor(private timing: TimingPort, private storage?: StoragePort) {}

  // Wrap für drawWorld Messung — nutzt TimingPort.now()
  measure<T>(id: string, stage: PipelineSample["stage"], level: number, available: boolean, fn: ()=> T): T {
    this.totalEligibleChecks++
    if (!available) this.availableFalse++
    const t0 = this.timing.now()
    const out = fn()
    const dt = this.timing.now() - t0
    this.samples.push({ ts: Date.now(), id, stage, ms: dt, level, available })
    // Keep last 300 samples (5s @60fps)
    if (this.samples.length > 300) this.samples.shift()
    return out
  }

  // Voxel-spezifisch: triangles zählen
  recordTriangles(id: string, n: number): void {
    const last = [...this.samples].reverse().find(s=> s.id===id && s.stage==="drawWorld")
    if (last) last.triangles = n
  }

  markBroken(id: string): void { this.broken.add(id) }

  stats(id?: string, stage?: PipelineSample["stage"]): PipelineStats {
    let filtered = this.samples
    if (id) filtered = filtered.filter(s=> s.id===id)
    if (stage) filtered = filtered.filter(s=> s.stage===stage)
    const sorted = [...filtered].map(s=> s.ms).sort((a,b)=> a-b)
    const p = (pct:number)=> sorted.length ? sorted[Math.min(sorted.length-1, Math.floor(sorted.length*pct))] : 0
    return {
      p50: p(0.5), p95: p(0.95), p99: p(0.99),
      count: filtered.length,
      broken: [...this.broken],
      availableFalseRate: this.totalEligibleChecks ? this.availableFalse / this.totalEligibleChecks : 0,
    }
  }

  // Adaptive Entscheidung: Budget Überschreitung → LOD Downgrade Vorschlag
  shouldDowngrade(id: string, budgetMs: number): boolean {
    const s = this.stats(id, "drawWorld")
    // 3 aufeinander p95 > budget → downgrade (wie §30 AdaptivePerformanceManager)
    return s.count >= 10 && s.p95 > budgetMs
  }

  // Optional persist für Diagnostics Bundle (§49)
  persist(key="telemetry:pipeline"): void {
    if (!this.storage) return
    try { this.storage.set(key, { samples: this.samples.slice(-50), broken: [...this.broken] }) } catch {}
  }
}
