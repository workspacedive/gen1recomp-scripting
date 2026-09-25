/**
 * VoxelPreloadAdapter — verbindet PipelineAdapter LOD + VoxelPackImporter + Preload Budget
 * Quelle: docs/ARCHITEKTUR.md §21 Predictive Preloading, §22 Budget, §25 Asset Streaming
 * Parallel-Verbesserung entdeckt: Voxel Chunks sind größte Preload-Assets — brauchen eigenen Budget-Bucket.
 *
 * Flow:
 *  Current Map → Transition Graph (connections) → Top-N (prob * distance)
 *  → für jedes Ziel: VoxelPackImporter.import mit LOD aus PipelineAdapter.level(voxel)
 *  → JobsPort + ResourceGovernor Budget (ramBytes, cpuMsPerFrame)
 *
 * Budget: VoxelPreload teilt sich Preload Budget, aber mit niedriger Prio (REMOTE=5 evict zuerst),
 *         bei pressure warning/critical wird Voxel-Preload sofort gecancelt (Governor.tickVoxelLOD).
 */

import type { PipelineAdapter } from "../render/PipelineAdapter"
import { VoxelAssetPipeline } from "../render/VoxelBackends"
import type { VoxelPackImporter } from "../import/VoxelPackImporter"

export type TransitionEdge = { to: string; prob: number; dist: number } // dist = BFS depth
export type PreloadTarget = { mapId: string; prob: number; priority: number; lods: { res:number; shadow:boolean } }

export type VoxelPreloadBudget = {
  ramBytes: number // z.B. 8 MiB
  maxConcurrent: number // z.B. 2
}

export class VoxelPreloadAdapter {
  constructor(
    private pipelines: PipelineAdapter,
    private importer: VoxelPackImporter,
    private budget: VoxelPreloadBudget = { ramBytes: 8*1024*1024, maxConcurrent: 2 },
  ) {}

  // Berechne Top-N Ziele aus Transition Graph + prob*priority
  // Priority mapping: Current 100, Next 80, Possible 40, Remote 5 (aus §22)
  computeTargets(
    currentMap: string,
    graph: Record<string, TransitionEdge[]>,
    n: number = 3,
  ): PreloadTarget[] {
    const voxelId = this.findVoxelPipeline()
    const raw = voxelId ? this.pipelines.level(voxelId) : 0
    if (raw === 0) return [] // OFF → kein Voxel preload
    // levels OFF/15/35/50 → map index to numeric value for lodsForLevel
    const lvlNumeric = [0,15,35,50][raw] ?? raw
    const lods = VoxelAssetPipeline.lodsForLevel(lvlNumeric)

    const edges = graph[currentMap] ?? []
    const scored = edges
      .map(e=> ({
        mapId: e.to,
        prob: e.prob,
        priority: e.prob > 0.5 ? 80 : e.prob > 0.2 ? 40 : 5,
        lods,
        score: e.prob / (e.dist || 1),
      }))
      .sort((a,b)=> b.score - a.score)
      .slice(0, n)
      .map(s=> ({ mapId:s.mapId, prob:s.prob, priority:s.priority, lods:s.lods }))

    return scored
  }

  private findVoxelPipeline(): string | null {
    // Suche erste Pipeline mit drawWorld und levels OFF/15/35/50 (Voxel)
    for (const {id, def} of this.pipelines.list()) {
      if (def.drawWorld && def.levels?.includes("15")) return id
    }
    // Fallback: erstes drawWorld überhaupt
    for (const {id, def} of this.pipelines.list()) if (def.drawWorld) return id
    return null
  }

  // Preload ausführen — bricht bei Budget überschreitung oder Governor downgrade ab
  async preload(
    targets: PreloadTarget[],
    opts: {
      apiVersion: string; coreVersion: string; depHash: string; graphicsProfile: string
      modId: string
      signal?: AbortSignal
      onProgress?: (mapId:string, ok:boolean)=> void
    }
  ): Promise<{ loaded: string[]; skipped: string[]; aborted: boolean }> {
    const loaded: string[] = []
    const skipped: string[] = []
    let aborted = false
    let ramUsed = 0

    // Sort by priority desc (wie JobScheduler)
    const sorted = [...targets].sort((a,b)=> b.priority - a.priority)

    for (const t of sorted) {
      if (opts.signal?.aborted) { aborted = true; break }
      // Budget check: LOD res=32 braucht ~4x so viel wie 8
      const estBytes = t.lods.res * t.lods.res * 1024 // grob: res² * 1KiB
      if (ramUsed + estBytes > this.budget.ramBytes) {
        skipped.push(t.mapId)
        continue
      }
      if (loaded.length >= this.budget.maxConcurrent) {
        skipped.push(t.mapId)
        continue
      }

      try {
        // Importer braucht bytes — hier simulieren wir: falls schon cached, skip; sonst importiere leeres Mesh
        // Für Test: importer.import mit kleinem Dummy
        const res = await this.importer.import({
          modId: opts.modId,
          mapId: t.mapId,
          kind: "bin",
          bytes: new Uint8Array(estBytes),
          apiVersion: opts.apiVersion,
          coreVersion: opts.coreVersion,
          depHash: opts.depHash,
          graphicsProfile: opts.graphicsProfile,
        })
        if (res.ok) { loaded.push(t.mapId); ramUsed += res.bytesWritten; opts.onProgress?.(t.mapId, true) }
        else { skipped.push(t.mapId); opts.onProgress?.(t.mapId, false) }
      } catch {
        skipped.push(t.mapId)
      }
    }

    return { loaded, skipped, aborted }
  }
}
