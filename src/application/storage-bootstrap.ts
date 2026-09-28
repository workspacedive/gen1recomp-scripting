import type { FileStore } from '../ports/file-store.js'
import { storageLayout, type StorageLayout } from '../domain/paths.js'

export const STORAGE_SCHEMA_VERSION = 1

export async function bootstrapStorage(store: FileStore, documentsDirectory: string): Promise<StorageLayout> {
  const layout = storageLayout(documentsDirectory)
  const dirs = Object.values(layout)
  for (const directory of dirs) await store.makeDirectory(directory, true)

  const marker = `${layout.root}/storage.v1.json`
  if (!(await store.exists(marker))) {
    await store.writeText(marker, JSON.stringify({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      product: 'gen1recomp-scripting',
      criticalDataNeverLivesOnlyInCache: true,
    }, null, 2) + '\n')
  }
  return layout
}
