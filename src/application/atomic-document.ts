import type { DigestPort, FileStore } from '../ports/file-store.js'

export interface CommitReceipt {
  readonly target: string
  readonly sha256: string
  readonly byteLength: number
  readonly backupCreated: boolean
}

/** Journal-friendly replacement. It does not claim host rename is atomic. */
export async function replaceDocument(input: {
  store: FileStore
  digest: DigestPort
  target: string
  staging: string
  backup: string
  bytes: Uint8Array
  expectedSha256?: string
}): Promise<CommitReceipt> {
  const actual = await input.digest.sha256(input.bytes)
  if (input.expectedSha256 && actual !== input.expectedSha256) throw new Error('staged hash mismatch')

  await input.store.writeBytes(input.staging, input.bytes)
  const roundtrip = await input.store.readBytes(input.staging)
  const verified = await input.digest.sha256(roundtrip)
  if (verified !== actual || roundtrip.byteLength !== input.bytes.byteLength) {
    await input.store.remove(input.staging)
    throw new Error('staging verification failed')
  }

  let backupCreated = false
  if (await input.store.exists(input.target)) {
    if (await input.store.exists(input.backup)) await input.store.remove(input.backup)
    await input.store.copy(input.target, input.backup)
    backupCreated = true
  }

  try {
    if (await input.store.exists(input.target)) await input.store.remove(input.target)
    await input.store.rename(input.staging, input.target)
  } catch (error) {
    if (!(await input.store.exists(input.target)) && backupCreated) await input.store.copy(input.backup, input.target)
    throw error
  }

  return { target: input.target, sha256: actual, byteLength: input.bytes.byteLength, backupCreated }
}
