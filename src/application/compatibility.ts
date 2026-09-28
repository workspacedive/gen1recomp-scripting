import type { CoreManifest, LaunchProfile, LibraryEntry } from '../domain/model.js'

export type Compatibility = 'compatible' | 'warning' | 'incompatible' | 'unknown'
export interface CapabilitySnapshot {
  readonly wasmBasic: boolean | null
  readonly webgl: boolean | null
  readonly audio: boolean | null
  readonly localSubresources: boolean | null
}
export interface CompatibilityResult {
  readonly status: Compatibility
  readonly reasons: readonly string[]
}

export function evaluateCompatibility(input: {
  entry: LibraryEntry | null
  profile: LaunchProfile
  core: CoreManifest | null
  capabilities: CapabilitySnapshot
}): CompatibilityResult {
  const reasons: string[] = []
  if (!input.entry) reasons.push('content.missing')
  if (!input.core) reasons.push('core.missing')
  if (input.entry && input.entry.id !== input.profile.gameId) reasons.push('profile.game-mismatch')
  if (input.entry && input.entry.identity.sha256 !== input.profile.contentHash) reasons.push('profile.content-mismatch')
  if (input.core && (input.core.coreId !== input.profile.coreId || input.core.version !== input.profile.coreVersion)) {
    reasons.push('profile.core-mismatch')
  }
  if (reasons.length) return { status: 'incompatible', reasons }

  const hard = Object.entries(input.capabilities).filter(([, value]) => value === false)
  if (hard.length) return { status: 'incompatible', reasons: hard.map(([key]) => `host.${key}.unavailable`) }
  const unknown = Object.entries(input.capabilities).filter(([, value]) => value === null)
  if (unknown.length) return { status: 'unknown', reasons: unknown.map(([key]) => `host.${key}.unknown`) }
  return { status: 'compatible', reasons: [] }
}
