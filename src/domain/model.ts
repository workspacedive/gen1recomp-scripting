export type Sha256 = string & { readonly __sha256: unique symbol }
export type EntityId = string & { readonly __entityId: unique symbol }

export type GameKey = 'red' | 'blue' | 'yellow' | (string & {})
export type TrustLevel =
  | 'trusted-internal'
  | 'signed'
  | 'verified-hash'
  | 'local-development'
  | 'unverified'

export interface ContentIdentity {
  readonly schemaVersion: 1
  readonly id: EntityId
  readonly sha256: Sha256
  readonly upstreamSha1?: string
  readonly game: GameKey | 'unknown'
  readonly region: string
  readonly language: string
  readonly revision: string
  readonly format: 'gb' | 'gbc' | 'gba' | 'unknown'
  readonly contentType: 'original' | 'patched' | 'generated'
  readonly byteLength: number
}

export interface CoreManifest {
  readonly schemaVersion: 1
  readonly coreId: EntityId
  readonly version: string
  readonly sourceCommit: string
  readonly artifactHash: Sha256
  readonly apiVersion: number
  readonly hostContract: number
  readonly minHostVersion: string
  readonly trust: TrustLevel
  readonly features: readonly string[]
}

export interface LaunchProfile {
  readonly schemaVersion: 1
  readonly id: EntityId
  readonly gameId: EntityId
  readonly contentHash: Sha256
  readonly coreId: EntityId
  readonly coreVersion: string
  readonly modSetHash: Sha256 | null
  readonly graphicsProfile: string
  readonly inputProfile: string
  readonly audioProfile: string
  readonly saveProfile: string
  readonly performanceProfile: 'high' | 'balanced' | 'low' | 'safe'
  readonly language: 'de' | 'en'
  readonly accessibility: Readonly<Record<string, boolean>>
  readonly featureFlags: Readonly<Record<string, boolean>>
}

export interface LibraryEntry {
  readonly schemaVersion: 1
  readonly id: EntityId
  readonly identity: ContentIdentity
  readonly displayName: string
  readonly importedAt: string
  readonly profileIds: readonly EntityId[]
  readonly lastPlayedAt?: string
}

export function asSha256(value: string): Sha256 {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('invalid SHA-256')
  return value as Sha256
}

export function asEntityId(value: string): EntityId {
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(value)) throw new Error('invalid entity id')
  return value as EntityId
}
