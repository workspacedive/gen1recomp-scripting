import { APP } from './config'
import type { ProbeReport } from './capability-probe'

export interface RuntimeGate {
  status: 'blocked' | 'probe-required' | 'candidate'
  reasons: string[]
}

export function evaluateRuntimeGate(report: ProbeReport | null): RuntimeGate {
  if (!report) return { status: 'probe-required', reasons: ['capability-probe.required', 'core.missing'] }
  const reasons: string[] = []
  if (!report.wasm.apiPresent) reasons.push('host.wasm.unavailable')
  if (!report.graphics.webgl1 || !report.graphics.clearReadback) reasons.push('host.webgl.unavailable')
  if (!report.audio.contextConstructed) reasons.push('host.audio.unavailable')
  if (!report.storage.indexedDbApiPresent) reasons.push('host.indexeddb.unavailable')
  if (!report.runtime.localScriptSubresource) reasons.push('host.local-script-subresource.unavailable')
  // The lightweight capability probe intentionally does not instantiate WASM
  // or mutate persistent storage. Those two gates are verified by the pinned
  // runtime's mandatory pre-launch boot path instead of being misreported as
  // permanent blockers here.
  if (!APP.runtimeEnabled) reasons.push('runtime.feature-disabled')
  return { status: reasons.length ? 'blocked' : 'candidate', reasons }
}
