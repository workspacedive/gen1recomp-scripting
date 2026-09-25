/**
 * Manifest — Type definitions for tools/rom_manifest*.json
 * VERIFIZIERT gegen /tmp/gen1recomp/tools/rom_manifest*.json
 */
import type { GameId } from "../library/GameLibrary"

export type Manifest = {
  romSha1: string
  format?: number
  symbols: Record<string, [number, number]> // bank, address
  charmap: Record<string, string>
  fontCharmap?: Record<string,string>
  constants: {
    tilesetOrder: string[]
    mapOrder: string[]
    spriteOrder: string[]
    maps: Record<string, { width: number; height: number; index: number }>
    // ... other constants loosely typed
    [k: string]: any
  }
  maps: Record<string, {
    label: string
    blockLength: number
    signTexts: string[]
    objects: Array<{ text: string; item?: string; trainerClass?: string; trainerParty?: any; pokemon?: string; name?: string; hidden?: boolean }>
  }>
  tilesets: Array<{ id: string; imageBase: string; imageWidth: number; imageHeight: number; blockCount: number }>
  tileAnimations: any[]
  text?: any
  field?: any
  battleAnimations?: any
  sfxKeys?: string[]
  items?: any
  trainers?: any
  pokemonAssets?: any
  audio?: any
  // Gen2
  roofs?: any
  sprites?: any
  scripts?: any
  pokemon?: any
  encounters?: any
  landmarks?: any
  marts?: any
  [k: string]: any
}

// Static imports — bundled via esbuild/vite (resolveJsonModule)
// Each manifest ~0.4-1.2M, compressed in .scripting ~400k total. Only Gen1+Gold/Crystal bundled for now.
import red from "./manifests/red.json"
import blue from "./manifests/blue.json"
import yellow from "./manifests/yellow.json"
import gold from "./manifests/gold.json"
import silver from "./manifests/silver.json"
import crystal from "./manifests/crystal.json"

const BUNDLED: Record<string, Manifest> = {
  red: red as unknown as Manifest,
  blue: blue as unknown as Manifest,
  yellow: yellow as unknown as Manifest,
  gold: gold as unknown as Manifest,
  silver: silver as unknown as Manifest,
  crystal: crystal as unknown as Manifest,
}

export function loadManifest(gameId: GameId): Manifest | null {
  return BUNDLED[gameId] ?? null
}

export function manifestForGameId(gameId: GameId): Manifest {
  const m = loadManifest(gameId)
  if (!m) throw new Error(`no manifest for ${gameId}`)
  return m
}

export function acceptsSha1(gameId: GameId, sha1: string): boolean {
  const m = loadManifest(gameId)
  if (!m) return false
  return m.romSha1.toLowerCase() === sha1.toLowerCase()
}
