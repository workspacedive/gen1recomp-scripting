/**
 * AtomicFile — Shared helper for atomic writes (copy+verify pattern)
 * Quelle: docs/ARCHITEKTUR.md §12 Atomic Save (copy+verify statt rename — NICHT VERIFIZIERT atomar)
 *        + §16 UpdateTransactionManager (staged→verified→active) + src/coreStore/CoreStore.ts pattern.
 *
 * Kein Pro, nutzt nur FilesPort. Wiederverwendbar für CoreStore, VoxelPackImporter,
 * SaveManager, ModCache. Parallel-Verbesserung entdeckt während Voxel-Arbeit:
 * drei Stellen duplizierten tmp→copy→verify→remove — jetzt zentral.
 */

import type { FilesPort } from "./ports"

export type AtomicWriteResult = { ok: true; verifiedBytes: number } | { ok: false; error: string }

export async function atomicWriteBytes(
  files: FilesPort,
  dest: string,
  bytes: Uint8Array,
  opts: { expectedBytes?: number } = {}
): Promise<AtomicWriteResult> {
  const tmp = dest + ".tmp"
  try { await files.remove(tmp) } catch {}
  // Ensure parent dir exists
  const slash = dest.lastIndexOf("/")
  if (slash > 0) {
    const dir = dest.slice(0, slash)
    try { await files.createDirectory(dir, true) } catch {}
  }
  try {
    await files.writeAsBytes(tmp, bytes)
    const verify = await files.readAsBytes(tmp)
    if (verify.length !== bytes.length) throw new Error(`verify length ${verify.length} != ${bytes.length}`)
    if (opts.expectedBytes !== undefined && verify.length !== opts.expectedBytes) throw new Error(`expected ${opts.expectedBytes} got ${verify.length}`)
    await files.copyFile(tmp, dest)
    // Verify dest readable
    const final = await files.readAsBytes(dest)
    if (final.length !== bytes.length) throw new Error("final verify mismatch")
    await files.remove(tmp)
    return { ok: true, verifiedBytes: final.length }
  } catch (e) {
    try { await files.remove(tmp) } catch {}
    return { ok: false, error: String(e) }
  }
}

export async function atomicWriteString(
  files: FilesPort,
  dest: string,
  text: string,
): Promise<AtomicWriteResult> {
  return atomicWriteBytes(files, dest, new TextEncoder().encode(text))
}
