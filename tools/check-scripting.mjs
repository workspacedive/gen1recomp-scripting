import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('scripting/Gen1Recomp')
const manifest = JSON.parse(await readFile(resolve(root, 'script.json'), 'utf8'))
if (manifest.entry !== 'index.tsx') throw new Error('Scripting manifest entry must be index.tsx')
if (manifest.permissions !== null) throw new Error('Unexpected Scripting permissions declaration')

await build({
  entryPoints: [resolve(root, manifest.entry)],
  bundle: true,
  write: false,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  jsx: 'transform',
  external: ['scripting'],
  logLevel: 'warning',
})

console.log(`Scripting project ${manifest.name} ${manifest.version}: syntax, imports, and bundle graph OK`)
