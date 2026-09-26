import { APP } from './config'
import { PATHS, saveCapabilityReport } from './host'

export interface ProbeReport {
  schemaVersion: 2
  testedAt: string
  status: 'probe-only-not-runtime-certification'
  runtime: { loveJsBoot: 'not-tested'; localScriptSubresource: boolean; wasmSubresource: 'not-tested'; persistentVfs: 'not-tested' }
  wasm: { apiPresent: boolean; validates: boolean; instantiates: boolean; simd: boolean }
  graphics: { webgl1: boolean; webgl2: boolean; clearReadback: boolean }
  audio: { webAudioApiPresent: boolean; contextConstructed: boolean; state: string }
  workers: { dedicatedApiPresent: boolean; sharedArrayBuffer: boolean; crossOriginIsolated: boolean; offscreenCanvas: boolean }
  storage: { indexedDbApiPresent: boolean }
  input: { gamepadApiPresent: boolean; touchApiPresent: boolean; maxTouchPoints: number }
  environment: { secureContext: boolean; userAgent: string; hardwareConcurrency: number | null }
  errors: string[]
}

type BrowserProbe = Omit<ProbeReport, 'schemaVersion' | 'testedAt' | 'status' | 'runtime'> & { localScriptLoaded: boolean }

async function prepareLocalProbe(): Promise<{ directory: string; entry: string }> {
  const directory = `${PATHS.diagnostics}/runtime-probe-v2`
  await FileManager.createDirectory(directory, true)
  await FileManager.writeAsString(`${directory}/probe.js`, 'window.__gen1recompLocalScript = "loaded-v2";')
  await FileManager.writeAsString(`${directory}/index.html`, [
    '<!doctype html>',
    '<meta name="viewport" content="width=device-width">',
    '<canvas id="c" width="2" height="2"></canvas>',
    '<script src="./probe.js"></script>',
  ].join(''))
  return { directory, entry: `${directory}/index.html` }
}

export async function runCapabilityProbe(): Promise<ProbeReport> {
  const files = await prepareLocalProbe()
  const controller = new WebViewController({ ephemeral: false })
  try {
    const loaded = await controller.loadFile(files.entry, files.directory)
    if (!loaded || !(await controller.waitForLoad())) throw new Error('The local WebView probe did not load')
    const result = await controller.evaluateJavaScript<BrowserProbe>(`
      return (() => {
        const errors = [];
        const basicModule = new Uint8Array([0,97,115,109,1,0,0,0]);
        let apiPresent = false, validates = false, instantiates = false, simd = false;
        try {
          apiPresent = typeof WebAssembly === 'object';
          validates = apiPresent && WebAssembly.validate(basicModule);
          if (validates) { const module = new WebAssembly.Module(basicModule); new WebAssembly.Instance(module); instantiates = true; }
          const simdModule = new Uint8Array([
            0,97,115,109,1,0,0,0, 1,5,1,96,0,1,123, 3,2,1,0,
            10,22,1,20,0,253,12, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 11
          ]);
          simd = apiPresent && WebAssembly.validate(simdModule);
        } catch (e) { errors.push('wasm:' + String(e)); }

        let gl1 = false, gl2 = false, clearReadback = false;
        try {
          const canvas = document.getElementById('c');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          gl2 = !!canvas.getContext('webgl2');
          gl1 = gl2 || !!gl;
          if (gl) {
            gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
            const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            clearReadback = pixel[0] > 200 && pixel[1] < 20 && pixel[2] < 20 && pixel[3] > 200;
          }
        } catch (e) { errors.push('webgl:' + String(e)); }

        let contextConstructed = false, audioState = 'unavailable';
        try {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (Audio) { const context = new Audio(); contextConstructed = true; audioState = String(context.state); context.close(); }
        } catch (e) { errors.push('audio:' + String(e)); }

        return {
          localScriptLoaded: window.__gen1recompLocalScript === 'loaded-v2',
          wasm: { apiPresent, validates, instantiates, simd },
          graphics: { webgl1: gl1, webgl2: gl2, clearReadback },
          audio: { webAudioApiPresent: !!(window.AudioContext || window.webkitAudioContext), contextConstructed, state: audioState },
          workers: {
            dedicatedApiPresent: typeof Worker !== 'undefined',
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            crossOriginIsolated: window.crossOriginIsolated === true,
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined'
          },
          storage: { indexedDbApiPresent: typeof indexedDB !== 'undefined' },
          input: {
            gamepadApiPresent: typeof navigator.getGamepads === 'function',
            touchApiPresent: 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0,
            maxTouchPoints: Number(navigator.maxTouchPoints || 0)
          },
          environment: {
            secureContext: window.isSecureContext === true,
            userAgent: String(navigator.userAgent || ''),
            hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency) ? Number(navigator.hardwareConcurrency) : null
          },
          errors
        };
      })()
    `)
    const { localScriptLoaded, ...browser } = result
    const report: ProbeReport = {
      schemaVersion: APP.capabilitySchema,
      testedAt: new Date().toISOString(),
      status: 'probe-only-not-runtime-certification',
      runtime: {
        loveJsBoot: 'not-tested', localScriptSubresource: localScriptLoaded,
        wasmSubresource: 'not-tested', persistentVfs: 'not-tested',
      },
      ...browser,
    }
    await saveCapabilityReport(report)
    return report
  } finally {
    controller.dispose()
  }
}
