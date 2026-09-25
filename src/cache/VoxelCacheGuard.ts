/**
 * VoxelCacheGuard — Enforces mod.cache / mod.storage limits for Voxel assets
 * VERIFIZIERT gegen Scripting + Gen1Recomp: mod.cache 64MiB (Quelle docs/modding.md),
 * FileManager 8MiB per write (implizit), mod.storage:writeBytes 512MiB staged+verified
 *
 * Kontinuierliche Verbesserung: Voxel ist Last-Treiber für alle Cache/Storage; Guard gilt generisch.
 */
export const LIMITS = {
  MOD_CACHE_PER_FILE: 8 * 1024 * 1024, // 8 MiB (FileManager)
  MOD_CACHE_TOTAL: 64 * 1024 * 1024, // 64 MiB (mod.cache doc)
  MOD_STORAGE_TOTAL: 512 * 1024 * 1024, // 512 MiB staged+byte-verified
  ENTRY_MAX_BYTES: 8 * 1024 * 1024, // Zip Entry limit (aus CoreStore)
} as const

export type WriteIntent = { bytes: number; totalAfter: number; target: "mod.cache"|"mod.storage" }

export function validateVoxelWrite(intent: WriteIntent): { ok: true } | { ok: false; reason: string } {
  if (intent.bytes > LIMITS.MOD_CACHE_PER_FILE) {
    return { ok: false, reason: `per-file ${intent.bytes} > ${LIMITS.MOD_CACHE_PER_FILE} (8MiB cap)` }
  }
  if (intent.target === "mod.cache" && intent.totalAfter > LIMITS.MOD_CACHE_TOTAL) {
    return { ok: false, reason: `mod.cache cap ${intent.totalAfter} > ${LIMITS.MOD_CACHE_TOTAL} (64MiB)` }
  }
  if (intent.target === "mod.storage" && intent.totalAfter > LIMITS.MOD_STORAGE_TOTAL) {
    return { ok: false, reason: `mod.storage cap ${intent.totalAfter} > ${LIMITS.MOD_STORAGE_TOTAL} (512MiB)` }
  }
  return { ok: true }
}

// SafePath helper — verhindert Zip-Slip / Path Traversal bei voxel extrahierten Meshes
export function safeVoxelPath(base: string, rel: string): string | null {
  const joined = `${base.replace(/\/+$/,"")}/${rel.replace(/^\/+/,"")}`
  // Normalisieren: keine .. Segmente erlauben
  const parts = joined.split("/").filter(Boolean)
  const stack: string[] = []
  for (const p of parts) {
    if (p === "..") {
      if (stack.length === 0) return null
      stack.pop()
    } else if (p !== ".") stack.push(p)
  }
  const normalized = stack.join("/")
  if (!normalized.startsWith(base.replace(/^\/+/,"").replace(/\/+$/,""))) return null
  return "/" + normalized
}
