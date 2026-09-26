import { APP } from './config'
import type { ProbeReport } from './capability-probe'

export interface RuntimeGate {
  status: 'blocked' | 'probe-required' | 'candidate'
  reasons: string[]
}

export function evaluateRuntimeGate(report: ProbeReport | null): RuntimeGate {
  if (!report) return { status: 'probe-required', reasons: ['capability-probe.required', 'core.missing'] }
  const reasons: string[] = []
  if (!report.wasm.instantiates) reasons.push('host.wasm.unavailable')
  if (!report.graphics.webgl1 || !report.graphics.clearReadback) reasons.push('host.webgl.unavailable')
  if (!report.audio.contextConstructed) reasons.push('host.audio.unavailable')
  if (!report.storage.indexedDbApiPresent) reasons.push('host.indexeddb.unavailable')
  if (!report.runtime.localScriptSubresource) reasons.push('host.local-script-subresource.unavailable')
  if (report.runtime.wasmSubresource === 'not-tested') reasons.push('host.wasm-subresource.unknown')
  if (report.runtime.persistentVfs === 'not-tested') reasons.push('host.persistent-vfs.unknown')
  reasons.push('core.missing')
  if (!APP.runtimeEnabled) reasons.push('runtime.feature-disabled')
  return { status: reasons.length ? 'blocked' : 'candidate', reasons }
}
