import { build } from 'esbuild'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('scripting/Gen1Recomp')
const manifest = JSON.parse(await readFile(resolve(root, 'script.json'), 'utf8'))
if (manifest.entry !== 'index.tsx') throw new Error('Scripting manifest entry must be index.tsx')
if (manifest.permissions !== null) throw new Error('Unexpected Scripting permissions declaration')
const configText = await readFile(resolve(root, 'config.ts'), 'utf8')
const configVersion = configText.match(/\bversion:\s*'([^']+)'/)?.[1]
if (configVersion !== manifest.version) throw new Error(`Version mismatch: config=${configVersion}, manifest=${manifest.version}`)

async function sourceFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path)
  }
  return files
}

// Scripting exposes UI/React symbols from the `scripting` module, while service
// APIs are injected globals. Importing one of these globals compiles to
// undefined at runtime even though its documentation names it like a class.
const globalOnly = new Set([
  'Crypto', 'Data', 'Dialog', 'DocumentPicker', 'FileManager', 'QRCode',
  'ShareSheet', 'WebViewController',
])
for (const file of await sourceFiles(root)) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(/import\s*{([^}]*)}\s*from\s*['"]scripting['"]/gs)) {
    const imported = match[1].split(',').map(part => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean)
    const invalid = imported.filter(name => globalOnly.has(name))
    if (invalid.length) throw new Error(`${file}: Scripting global API imported as module export: ${invalid.join(', ')}`)
  }
}

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

console.log(`Scripting project ${manifest.name} ${manifest.version}: API boundary, syntax, imports, and bundle graph OK`)
