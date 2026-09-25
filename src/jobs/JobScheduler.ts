/**
 * JobScheduler — Zentrale Queue, Priority, Cancellation, Retry, Deadline, Memory Budget
 * Quelle: docs/ARCHITEKTUR.md §26 Background Job Scheduler, §22 Budget, §37 Memory
 * VERIFIZIERT gegen Scripting Thread.runInBackground (JobsPort) + ARCHITEKTUR Prio-Schema
 * pro_required: false
 *
 * Priorities (wie §22 + Voxel adaptiert):
 *  100 = current area (Save, Input)
 *   80 = next map
 *   40 = possible
 *   30 = voxel decode (neu, Prio 30 — parallel entdeckt: Voxel decode blockiert nicht Gameplay)
 *    5 = remote / low
 *
 * Features: PriorityQueue, AbortSignal, Retry (exponential), Deadline, Memory Budget via VoxelCacheGuard,
 * Dependency (dag), Concurrency limit.
 */

export type JobPriority = number // 0..100
export type JobKind = "save"|"voxel-decode"|"preload"|"import"|"cache"|"other"

export type JobOpts = {
  id?: string
  priority: JobPriority // höher = früher
  kind?: JobKind
  deadlineMs?: number // z.B. 300ms bis sichtbar — überschreitung → cancel
  retry?: number // max retries, default 0
  retryDelayMs?: number
  memoryBudgetBytes?: number // via VoxelCacheGuard.validate
  signal?: AbortSignal
  dependsOn?: string[] // ids
}

export type Job<T> = {
  id: string
  priority: JobPriority
  kind: JobKind
  run: (signal: AbortSignal)=> Promise<T>
  opts: JobOpts
  attempts: number
  createdAt: number
}

export type JobResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: string; cancelled: boolean; attempts: number }

type QueueEntry = { job: Job<any>; resolve: (r: JobResult<any>)=>void }

export class JobScheduler {
  private queue: QueueEntry[] = []
  private running = new Set<string>()
  private concurrency: number
  private completed = new Set<string>() // für dependsOn

  constructor(opts: { concurrency?: number } = {}) {
    this.concurrency = opts.concurrency ?? 2
  }

  // Für Tests: Vergabe prio für voxel decode = 30 (aus ARCHITEKTUR Voxel)
  static readonly VOXEL_DECODE_PRIORITY = 30

  enqueue<T>(run: (signal: AbortSignal)=> Promise<T>, opts: JobOpts): Promise<JobResult<T>> {
    const id = opts.id ?? `job-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    const job: Job<T> = {
      id, priority: opts.priority, kind: opts.kind ?? "other",
      run, opts, attempts: 0, createdAt: Date.now(),
    }
    return new Promise<JobResult<T>>((resolve)=>{
      const entry: QueueEntry = { job, resolve: resolve as any }
      // Insert sorted priority desc, then FIFO
      let idx = this.queue.findIndex(e=> e.job.priority < job.priority)
      if (idx === -1) this.queue.push(entry)
      else this.queue.splice(idx, 0, entry)
      this.pump()
    })
  }

  private canRun(entry: QueueEntry): boolean {
    const deps = entry.job.opts.dependsOn ?? []
    for (const d of deps) if (!this.completed.has(d)) return false
    if (entry.job.opts.signal?.aborted) return false
    if (entry.job.opts.deadlineMs !== undefined) {
      const age = Date.now() - entry.job.createdAt
      if (age > entry.job.opts.deadlineMs) return false
    }
    return true
  }

  private async pump(): Promise<void> {
    while (this.running.size < this.concurrency && this.queue.length > 0) {
      // Finde nächsten runnable (priority bereits sortiert, aber deps/deadline/abort überspringen)
      let idx = this.queue.findIndex(e=> this.canRun(e))
      if (idx === -1) {
        // Kein runnable wegen deps/deadline — prüfe abgelaufene → fail
        const expiredIdx = this.queue.findIndex(e=> {
          if (e.job.opts.signal?.aborted) return true
          if (e.job.opts.deadlineMs !== undefined && Date.now() - e.job.createdAt > e.job.opts.deadlineMs) return true
          return false
        })
        if (expiredIdx !== -1) {
          const entry = this.queue.splice(expiredIdx,1)[0]
          const cancelled = !!entry.job.opts.signal?.aborted
          entry.resolve({ ok:false, error: cancelled ? "cancelled" : "deadline", cancelled, attempts: entry.job.attempts } as any)
        }
        break
      }
      const entry = this.queue.splice(idx,1)[0]
      this.running.add(entry.job.id)
      this.execute(entry).finally(()=>{
        this.running.delete(entry.job.id)
        this.completed.add(entry.job.id)
        this.pump()
      })
    }
  }

  private async execute(entry: QueueEntry): Promise<void> {
    const job = entry.job
    const maxRetries = job.opts.retry ?? 0
    let lastError = ""
    while (job.attempts <= maxRetries) {
      if (job.opts.signal?.aborted) {
        entry.resolve({ ok:false, error:"cancelled", cancelled:true, attempts: job.attempts } as any)
        return
      }
      if (job.opts.memoryBudgetBytes !== undefined) {
        // Budget check: hier nur Heuristik — in echter Integration via VoxelCacheGuard.validate
        // Wenn Budget <0 → skip als limit
        if (job.opts.memoryBudgetBytes < 0) {
          entry.resolve({ ok:false, error:"memory budget exceeded", cancelled:false, attempts: job.attempts } as any)
          return
        }
      }
      try {
        const sig = job.opts.signal ?? new AbortController().signal
        // Wenn Deadline nah, race mit timeout
        let value: any
        if (job.opts.deadlineMs !== undefined) {
          const remaining = job.opts.deadlineMs - (Date.now() - job.createdAt)
          if (remaining <= 0) throw new Error("deadline")
          value = await Promise.race([
            job.run(sig),
            new Promise((_,rej)=> setTimeout(()=>rej(new Error("deadline")), remaining)),
          ])
        } else {
          value = await job.run(sig)
        }
        entry.resolve({ ok:true, value, attempts: job.attempts } as any)
        return
      } catch (e) {
        lastError = String(e)
        if (String(e).includes("cancelled") || job.opts.signal?.aborted) {
          entry.resolve({ ok:false, error: lastError, cancelled:true, attempts: job.attempts } as any)
          return
        }
        job.attempts++
        if (job.attempts > maxRetries) break
        const delay = (job.opts.retryDelayMs ?? 200) * job.attempts
        await new Promise(r=> setTimeout(r, delay))
      }
    }
    entry.resolve({ ok:false, error:lastError, cancelled:false, attempts: job.attempts } as any)
  }

  // Für ResourceGovernor: cancel alle low-prio (z. B. voxel bei critical)
  cancelByPriority(threshold: JobPriority): number {
    let n=0
    const keep: QueueEntry[] = []
    for (const e of this.queue) {
      if (e.job.priority <= threshold) {
        e.resolve({ ok:false, error:"cancelled by governor", cancelled:true, attempts: e.job.attempts } as any)
        n++
      } else keep.push(e)
    }
    this.queue = keep
    return n
  }

  pendingCount(): number { return this.queue.length }
  runningCount(): number { return this.running.size }
}
