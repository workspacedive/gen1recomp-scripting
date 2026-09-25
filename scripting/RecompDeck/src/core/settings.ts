// Settings schema, defaults and sanitising. Pure module.
// SPDX-License-Identifier: GPL-3.0-or-later

export type FpsCap = 30 | 60 | 120 | 0
export type Language = 'auto' | 'de' | 'en'

export interface Settings {
  /** Player frame cap (0 = display rate). 60 is the game's native rate. */
  fpsCap: FpsCap
  /** Render at device pixel ratio (sharper, more GPU work). */
  highdpi: boolean
  /** CSS nearest-neighbour upscaling of the canvas. */
  pixelated: boolean
  /** Draw under the notch/home indicator instead of inside the safe area. */
  fillEdges: boolean
  /** Initial WebAssembly memory in MiB (grows on demand). */
  memoryMB: 128 | 192 | 256 | 384
  /** Forward the game's rumble requests to the Taptic Engine. */
  haptics: boolean
  /** OS name reported to the game ("iOS" selects its touch layout). */
  reportOS: 'iOS' | 'Web'
  /** Keep a rolling backup of the save directory before each session. */
  autoBackup: boolean
  /** Number of automatic backups to keep. */
  backupsToKeep: number
  /** Check GitHub for new game releases when the launcher opens. */
  checkUpdates: boolean
  language: Language
  /** Diagnostics: run the runtime self-test on boot, verbose logs. */
  debug: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  fpsCap: 60,
  highdpi: true,
  pixelated: true,
  fillEdges: false,
  memoryMB: 192,
  haptics: true,
  reportOS: 'iOS',
  autoBackup: true,
  backupsToKeep: 5,
  checkUpdates: true,
  language: 'auto',
  debug: false,
}

const FPS: FpsCap[] = [30, 60, 120, 0]
const MEM: Settings['memoryMB'][] = [128, 192, 256, 384]

export function sanitizeSettings(raw: unknown): Settings {
  const s: Partial<Settings> = raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}
  const d = DEFAULT_SETTINGS
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)
  return {
    fpsCap: FPS.includes(s.fpsCap as FpsCap) ? (s.fpsCap as FpsCap) : d.fpsCap,
    highdpi: bool(s.highdpi, d.highdpi),
    pixelated: bool(s.pixelated, d.pixelated),
    fillEdges: bool(s.fillEdges, d.fillEdges),
    memoryMB: MEM.includes(s.memoryMB as Settings['memoryMB']) ? (s.memoryMB as Settings['memoryMB']) : d.memoryMB,
    haptics: bool(s.haptics, d.haptics),
    reportOS: s.reportOS === 'Web' ? 'Web' : 'iOS',
    autoBackup: bool(s.autoBackup, d.autoBackup),
    backupsToKeep: Number.isInteger(s.backupsToKeep) && (s.backupsToKeep as number) >= 1 && (s.backupsToKeep as number) <= 50
      ? (s.backupsToKeep as number) : d.backupsToKeep,
    checkUpdates: bool(s.checkUpdates, d.checkUpdates),
    language: s.language === 'de' || s.language === 'en' ? s.language : 'auto',
    debug: bool(s.debug, d.debug),
  }
}
