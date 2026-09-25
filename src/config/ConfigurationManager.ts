/**
 * ConfigurationManager — Bounded Context 28 (§28)
 * VERIFIZIERT gegen ARCHITEKTUR §28 + docs/settings, nutzt StoragePort
 * pro_required: false
 */

import type { StoragePort } from "../host/ports"

export type FeatureFlag = { key:string; enabled:boolean; version:number; description?:string }
export type Config = {
  language: "de"|"en"
  accessibility: { reducedMotion:boolean; highContrast:boolean; fontScale: number }
  featureFlags: Record<string, FeatureFlag>
  graphics: { quality:"low"|"balanced"|"high"|"auto"; voxelLOD: number }
}

const DEFAULT: Config = {
  language: "de",
  accessibility: { reducedMotion:false, highContrast:false, fontScale:1 },
  featureFlags: {},
  graphics: { quality:"auto", voxelLOD: 50 },
}

export class ConfigurationManager {
  constructor(private storage: StoragePort) {}
  private key(): string { return "config:v1" }

  get(): Config {
    const c=this.storage.get<Config>(this.key())
    if (!c) return JSON.parse(JSON.stringify(DEFAULT))
    return { ...JSON.parse(JSON.stringify(DEFAULT)), ...c, accessibility:{...DEFAULT.accessibility, ...c.accessibility}, graphics:{...DEFAULT.graphics, ...c.graphics} }
  }
  set(patch: Partial<Config>): Config {
    const cur=this.get()
    const next={ ...cur, ...patch, accessibility:{...cur.accessibility, ...(patch.accessibility??{})}, graphics:{...cur.graphics, ...(patch.graphics??{})} } as Config
    this.storage.set(this.key(), next as any)
    return next
  }
  setFlag(key:string, enabled:boolean): void {
    const c=this.get()
    const cur=c.featureFlags[key]
    c.featureFlags[key]={ key, enabled, version:(cur?.version??0)+1, description: cur?.description }
    this.storage.set(this.key(), c as any)
  }
  isEnabled(key:string): boolean {
    return !!this.get().featureFlags[key]?.enabled
  }
}
