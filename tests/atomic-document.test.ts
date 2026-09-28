import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceDocument } from '../src/application/atomic-document.js'
import type { DigestPort, FileStat, FileStore } from '../src/ports/file-store.js'

class MemoryStore implements FileStore {
  files = new Map<string, Uint8Array>()
  failRename = false
  async exists(path: string) { return this.files.has(path) }
  async stat(path: string): Promise<FileStat> { const data = this.files.get(path); return data ? { type: 'file', size: data.byteLength, modificationDate: 0 } : { type: 'notFound', size: 0, modificationDate: 0 } }
  async makeDirectory() {}
  async readBytes(path: string) { const data = this.files.get(path); if (!data) throw new Error('missing'); return data.slice() }
  async writeBytes(path: string, data: Uint8Array) { this.files.set(path, data.slice()) }
  async readText(path: string) { return new TextDecoder().decode(await this.readBytes(path)) }
  async writeText(path: string, data: string) { await this.writeBytes(path, new TextEncoder().encode(data)) }
  async list() { return [] }
  async rename(from: string, to: string) { if (this.failRename) throw new Error('injected'); const data = await this.readBytes(from); this.files.set(to, data); this.files.delete(from) }
  async copy(from: string, to: string) { this.files.set(to, (await this.readBytes(from)).slice()) }
  async remove(path: string) { this.files.delete(path) }
}
const digest: DigestPort = { async sha256(data) { return createHash('sha256').update(data).digest('hex') } }

test('verified replacement preserves backup', async () => {
  const store = new MemoryStore()
  await store.writeText('/target', 'old')
  const bytes = new TextEncoder().encode('new')
  const receipt = await replaceDocument({ store, digest, target: '/target', staging: '/tmp', backup: '/bak', bytes })
  assert.equal(await store.readText('/target'), 'new')
  assert.equal(await store.readText('/bak'), 'old')
  assert.equal(receipt.backupCreated, true)
})

test('rename failure restores target from backup', async () => {
  const store = new MemoryStore()
  await store.writeText('/target', 'old')
  store.failRename = true
  await assert.rejects(replaceDocument({ store, digest, target: '/target', staging: '/tmp', backup: '/bak', bytes: new TextEncoder().encode('new') }))
  assert.equal(await store.readText('/target'), 'old')
})
