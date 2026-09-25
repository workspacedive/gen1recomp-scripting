import { describe, it, expect } from "vitest"
import { JobScheduler } from "./JobScheduler"

describe("JobScheduler — Priority, Cancellation, Deadline, Retry, Governor", ()=>{
  it("Priority: höhere Prio wird zuerst ausgeführt (concurrency 1)", async()=>{
    const s=new JobScheduler({ concurrency: 1 })
    const order: string[] = []
    // Blockiere Queue mit erstem Job, damit prio ordering sichtbar
    const blocker = s.enqueue(()=> new Promise(r=> setTimeout(()=>{order.push("block"); r("b")}, 30)), { priority: 100 })
    const low = s.enqueue(async()=> { order.push("low"); return "low" }, { priority: 5 })
    const high = s.enqueue(async()=> { order.push("high"); return "high" }, { priority: 80 })
    const voxel = s.enqueue(async()=> { order.push("voxel"); return "voxel" }, { priority: JobScheduler.VOXEL_DECODE_PRIORITY })
    await blocker; await low; await high; await voxel
    // Nach blocker: high (80) vor voxel (30) vor low (5)
    expect(order).toEqual(["block","high","voxel","low"])
  })

  it("AbortSignal: enqueued Job wird cancelled", async()=>{
    const s=new JobScheduler({ concurrency: 1 })
    const ac=new AbortController()
    // Blockiere
    const blocker = s.enqueue(()=> new Promise(r=> setTimeout(()=> r("b"), 30)), { priority: 100 })
    const p = s.enqueue(()=> new Promise(r=> setTimeout(()=> r("x"), 100)), { priority: 50, signal: ac.signal })
    ac.abort()
    await blocker
    const res = await p
    expect(res.ok).toBe(false)
    expect((res as any).cancelled).toBe(true)
  })

  it("Deadline: überschritten → failed deadline", async()=>{
    const s=new JobScheduler({ concurrency: 1 })
    const blocker = s.enqueue(()=> new Promise(r=> setTimeout(()=> r("b"), 40)), { priority: 100 })
    const p = s.enqueue(()=> new Promise(r=> setTimeout(()=> r("x"), 50)), { priority: 50, deadlineMs: 10 })
    await blocker
    const res = await p
    expect(res.ok).toBe(false)
    expect((res as any).error).toContain("deadline")
  })

  it("Retry: fehlgeschlagener Job wird retry mit delay", async()=>{
    const s=new JobScheduler({ concurrency: 2 })
    let attempts=0
    const p = s.enqueue(async()=>{
      attempts++
      if (attempts < 3) throw new Error("fail")
      return "ok"
    }, { priority: 50, retry: 3, retryDelayMs: 10 })
    const r = await p
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(2)
  })

  it("cancelByPriority: Governor entfernt low-prio voxel bei critical", async()=>{
    const s=new JobScheduler({ concurrency: 1 })
    const blocker = s.enqueue(()=> new Promise(r=> setTimeout(()=> r("b"), 40)), { priority: 100 })
    const low = s.enqueue(async()=> "low", { priority: 5 })
    const voxel = s.enqueue(async()=> "voxel", { priority: JobScheduler.VOXEL_DECODE_PRIORITY })
    const high = s.enqueue(async()=> "high", { priority: 80 })
    // Governor cancel threshold 30 → voxel+low weg, high bleibt
    const n = s.cancelByPriority(30)
    expect(n).toBe(2)
    await blocker
    const hr = await high
    expect(hr.ok).toBe(true)
    const lr = await low
    expect(lr.ok).toBe(false)
    const vr = await voxel
    expect(vr.ok).toBe(false)
  })

  it("Dependency: Job wartet auf dependsOn", async()=>{
    const s=new JobScheduler({ concurrency: 2 })
    const order: string[] = []
    const a = s.enqueue(async()=> { order.push("a"); return "a" }, { priority: 50, id: "A" })
    const b = s.enqueue(async()=> { order.push("b"); return "b" }, { priority: 90, id: "B", dependsOn: ["A"] })
    await Promise.all([a,b])
    expect(order).toEqual(["a","b"]) // obwohl B höhere prio, wartet auf A
  })

  it("VOXEL_DECODE_PRIORITY = 30", ()=>{
    expect(JobScheduler.VOXEL_DECODE_PRIORITY).toBe(30)
  })
})
