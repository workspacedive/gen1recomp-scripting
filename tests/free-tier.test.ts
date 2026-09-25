import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

async function filesBelow(root: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...await filesBelow(full))
    else result.push(full)
  }
  return result
}

test('product code does not use known Pro-only BackgroundKeeper API', async () => {
  const files = [...await filesBelow('src'), ...await filesBelow('scripting')]
  const offenders: string[] = []
  for (const file of files.filter(file => /\.(ts|tsx)$/.test(file))) {
    if ((await readFile(file, 'utf8')).includes('BackgroundKeeper')) offenders.push(file)
  }
  assert.deepEqual(offenders, [])
})
