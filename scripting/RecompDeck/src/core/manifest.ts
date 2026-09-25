// gen1recomp mod manifest (manifest.json, API v1/v2) validation for the host.
// Mirrors the vocabulary of src/mods/Manifest.lua (v0.3.14) closely enough to
// reject broken packages before install and to show permissions to the user.
// The game's own loader validates again at boot (defense in depth).
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseSemver } from './semver'

export const MOD_PERMISSIONS = ['network', 'filesystem', 'engine_internals', 'steps', 'background', 'compute'] as const
export type ModPermission = typeof MOD_PERMISSIONS[number]

export const MOD_CATEGORIES = [
  'TWEAK', 'BALANCE', 'CONTENT', 'QUEST', 'MECHANIC', 'GRAPHICS', 'LANGUAGE',
  'AUDIO', 'UI', 'TOOL', 'TOTAL_CONVERSION', 'OTHER', 'GAMEPLAY',
] as const

export const GAME_TOKENS = ['red', 'blue', 'yellow', 'gold', 'silver', 'crystal', 'firered', 'leafgreen', 'gen1', 'gen2', 'gen3', 'all']

/** Permissions a web build can never honour (explained in the UI). */
export const UNAVAILABLE_ON_WEB: Partial<Record<ModPermission, string>> = {
  steps: 'Step counter access needs HealthKit (Scripting PRO) — not available.',
  background: 'Background threads are unavailable in the WebAssembly runtime.',
}

export interface ModManifest {
  id: string
  name: string
  version: string
  api: number
  entry?: string
  category?: string
  description?: string
  author?: string
  games: string[]
  permissions: ModPermission[]
  dependencies: string[]
  conflicts: string[]
  github?: string
}

export interface ManifestResult {
  manifest: ModManifest | null
  errors: string[]
  warnings: string[]
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function strArray(v: unknown, field: string, errors: string[]): string[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) { errors.push(`${field} must be an array`); return [] }
  const out: string[] = []
  for (const x of v) {
    if (typeof x === 'string') out.push(x)
    else if (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') out.push((x as { id: string }).id)
    else errors.push(`${field} contains an invalid entry`)
  }
  return out
}

export function validateManifest(raw: unknown): ManifestResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { manifest: null, errors: ['manifest.json must contain a JSON object'], warnings }
  }
  const m = raw as Record<string, unknown>
  const id = m.id
  if (typeof id !== 'string' || !ID_RE.test(id)) errors.push('id must match [A-Za-z0-9_-]{1,64}')
  const version = typeof m.version === 'string' ? m.version : ''
  if (!parseSemver(version)) errors.push('version must be a semantic version (x.y.z)')
  const api = m.api === undefined ? 1 : m.api
  if (api !== 1 && api !== 2) errors.push('api must be 1 or 2')
  if (m.entry !== undefined && (typeof m.entry !== 'string' || !/^[A-Za-z0-9_./-]+\.lua$/.test(m.entry) || m.entry.includes('..'))) {
    errors.push('entry must be a relative .lua path')
  }
  const category = typeof m.category === 'string' ? m.category.toUpperCase() : undefined
  if (category && !(MOD_CATEGORIES as readonly string[]).includes(category)) warnings.push(`unknown category ${category}`)
  let games = strArray(m.games, 'games', errors).map((g) => g.toLowerCase())
  if (m.gen2compat === true && !games.length) games = ['gen1', 'gen2']
  if (!games.length) games = ['gen1']
  for (const g of games) if (!GAME_TOKENS.includes(g)) warnings.push(`unknown game token ${g}`)
  const permsRaw = strArray(m.permissions, 'permissions', errors)
  const permissions: ModPermission[] = []
  for (const p of permsRaw) {
    if ((MOD_PERMISSIONS as readonly string[]).includes(p)) permissions.push(p as ModPermission)
    else errors.push(`unknown permission ${p}`)
  }
  if (id === 'recompdeck_bridge') errors.push('this id is reserved for the RecompDeck platform bridge')
  const manifest: ModManifest = {
    id: typeof id === 'string' ? id : '',
    name: typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 80) : String(id ?? ''),
    version,
    api: api as number,
    entry: typeof m.entry === 'string' ? m.entry : undefined,
    category,
    description: typeof m.description === 'string' ? m.description.slice(0, 2000) : undefined,
    author: typeof m.author === 'string' ? m.author.slice(0, 120) : undefined,
    games,
    permissions,
    dependencies: strArray(m.dependencies, 'dependencies', errors),
    conflicts: strArray(m.conflicts, 'conflicts', errors),
    github: typeof m.github === 'string' ? m.github : undefined,
  }
  return { manifest: errors.length ? null : manifest, errors, warnings }
}

/** Does a manifest claim the given game (mirrors ModTargets semantics)? */
export function modTargets(manifest: ModManifest, game: string, generation: number): boolean {
  return manifest.games.some((g) => g === 'all' || g === game || g === `gen${generation}`)
}
