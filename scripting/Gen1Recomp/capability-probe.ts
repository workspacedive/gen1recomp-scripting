import { WebViewController } from 'scripting'
import { saveCapabilityReport } from './host'

export interface ProbeReport {
  schemaVersion: 1
  testedAt: string
  status: 'probe-only-not-runtime-certification'
  wasm: { basic: boolean; simd: boolean }
  graphics: { webgl1: boolean; webgl2: boolean }
  audio: { webAudioApiPresent: boolean }
  workers: { dedicatedApiPresent: boolean; sharedArrayBuffer: boolean; offscreenCanvas: boolean }
  storage: { indexedDbApiPresent: boolean }
  input: { gamepadApiPresent: boolean }
  errors: string[]
}

export async function runCapabilityProbe(): Promise<ProbeReport> {
  const controller = new WebViewController({ ephemeral: false })
  try {
    await controller.loadHTML('<!doctype html><meta name="viewport" content="width=device-width"><canvas id="c"></canvas>')
    await controller.waitForLoad()
    const result = await controller.evaluateJavaScript<Omit<ProbeReport, 'schemaVersion' | 'testedAt' | 'status'>>(`
      return (() => {
        const errors = [];
        let wasm = false;
        let simd = false;
        try {
          wasm = typeof WebAssembly === 'object' && WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0]));
          const simdModule = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,253,12,0,0,0,0,11]);
          simd = wasm && WebAssembly.validate(simdModule);
        } catch (e) { errors.push('wasm:' + String(e)); }
        let gl1 = false, gl2 = false;
        try { const c = document.getElementById('c'); gl2 = !!c.getContext('webgl2'); gl1 = !!c.getContext('webgl'); } catch (e) { errors.push('webgl:' + String(e)); }
        return {
          wasm: { basic: wasm, simd },
          graphics: { webgl1: gl1, webgl2: gl2 },
          audio: { webAudioApiPresent: !!(window.AudioContext || window.webkitAudioContext) },
          workers: { dedicatedApiPresent: typeof Worker !== 'undefined', sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined', offscreenCanvas: typeof OffscreenCanvas !== 'undefined' },
          storage: { indexedDbApiPresent: typeof indexedDB !== 'undefined' },
          input: { gamepadApiPresent: typeof navigator.getGamepads === 'function' },
          errors
        };
      })()
    `)
    const report: ProbeReport = { schemaVersion: 1, testedAt: new Date().toISOString(), status: 'probe-only-not-runtime-certification', ...result }
    await saveCapabilityReport(report)
    return report
  } finally {
    controller.dispose()
  }
}
