// Application model: single source of truth for the launcher UI and all user
// actions. Views subscribe via useModel(); actions report progress through
// `busy` and errors through native dialogs.
// SPDX-License-Identifier: GPL-3.0-or-later

import { Script, useEffect, useState } from 'scripting'
import { GameId, GAMES, gameInfo } from '../core/constants'
import { resolveLang, strings, Lang } from '../core/i18n'
import type { LaunchRequest } from '../core/launch'
import { safeFileName } from '../core/paths'
import type { Settings } from '../core/settings'
import { isNewer } from '../core/semver'
import { cacheMeta, CacheMeta, removeCache } from '../data/cacheStore'
import { discardCandidate, inspectModZip, installCandidate, listMods, ModCandidate, ModRecord, removeMod, setModEnabled } from '../data/modStore'
import { importRom, listRoms, removeRom, StoredRom } from '../data/romStore'
import { backupNow, listBackups, restoreFromZip } from '../data/saveStore'
import { DIRS, ensureLayout, removeIfExists } from '../platform/fs'
import { log } from '../platform/log'
import { loadSettings, saveSettings, setShared } from '../platform/settingsStore'
import { activeGame, importLoveFile, installedGames, installRelease, InstalledGame, listReleases, ReleaseInfo } from '../runtime/gameManager'
import { installRuntime, runtimeStatus, RuntimeStatus } from '../runtime/runtimeManager'
import { PlayerSession, SessionEvent } from '../player/session'

export interface AppState {
  settings: Settings
  lang: Lang
  runtime: RuntimeStatus | null
  game: InstalledGame | null
  games: InstalledGame[]
  releases: ReleaseInfo[] | null
  updateAvailable: ReleaseInfo | null
  roms: Partial<Record<GameId, StoredRom>>
  caches: Partial<Record<GameId, CacheMeta | null>>
  mods: ModRecord[]
  busy: string | null
  lastSession: { stats: Record<string, unknown>; error: string | null; endedAt: string } | null
}

type Listener = () => void

function systemLocale(): string {
  try { return Device.preferredLanguages?.[0] ?? Device.systemLocale } catch { return 'en' }
}

export class AppModel {
  state: AppState
  private listeners = new Set<Listener>()

  constructor() {
    const settings = loadSettings()
    this.state = {
      settings,
      lang: resolveLang(settings.language, systemLocale()),
      runtime: null,
      game: null,
      games: [],
      releases: null,
      updateAvailable: null,
      roms: {},
      caches: {},
      mods: [],
      busy: null,
      lastSession: null,
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) { try { fn() } catch { /* view gone */ } }
  }

  get t() {
    return strings(this.state.lang)
  }

  async init() {
    await ensureLayout()
    await this.refresh()
    if (this.state.settings.checkUpdates && this.state.runtime?.installed) void this.checkReleases(true)
  }

  async refresh() {
    const [runtime, game, games, roms, mods] = await Promise.all([
      runtimeStatus(), activeGame(), installedGames(), listRoms(), listMods(),
    ])
    const caches: Partial<Record<GameId, CacheMeta | null>> = {}
    for (const g of GAMES) caches[g.id] = await cacheMeta(g.id)
    this.set({ runtime, game, games, roms, mods, caches })
    setShared('status', { game: game?.version ?? null, roms: Object.keys(roms), updatedAt: Date.now() })
  }

  /** Run an action with a progress label; errors become alerts. */
  async run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.state.busy) return undefined
    this.set({ busy: label })
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log('error', `${label}: ${msg}`)
      if (msg !== 'import cancelled') await Dialog.alert({ title: this.t.error, message: msg })
      return undefined
    } finally {
      this.set({ busy: null })
      await this.refresh().catch(() => undefined)
    }
  }

  private progress = (text: string) => this.set({ busy: text })

  // ---------------------------------------------------------------- setup
  installRuntime() {
    return this.run(this.t.downloading, () => installRuntime(this.progress))
  }

  async checkReleases(silent = false) {
    try {
      const releases = await listReleases()
      const withAsset = releases.filter((r) => r.loveAsset && !r.prerelease)
      const newest = withAsset[0] ?? null
      const current = this.state.game?.version ?? null
      this.set({ releases, updateAvailable: newest && current && isNewer(newest.version, current) ? newest : null })
    } catch (e) {
      log('warn', 'release check failed: ' + String(e))
      if (!silent) await Dialog.alert({ title: this.t.error, message: String(e) })
    }
  }

  installRelease(version: string) {
    return this.run(this.t.downloading, () => installRelease(version, this.progress))
  }

  async importLove() {
    const picked = await DocumentPicker.pickFiles({ types: ['public.zip-archive', 'public.data'] })
    if (!picked?.length) return
    await this.run(this.t.verifying, () => importLoveFile(picked[0], (sha) => Dialog.confirm({
      title: 'Unverified archive',
      message: `This file could not be matched against an official release checksum.\nSHA-256: ${sha}\n\nOnly continue if you obtained it from the official gen1recomp GitHub releases.`,
      confirmLabel: 'Use anyway',
      cancelLabel: this.t.cancel,
    })))
    DocumentPicker.stopAcessingSecurityScopedResources()
  }

  // ---------------------------------------------------------------- ROMs
  async importRom() {
    const picked = await DocumentPicker.pickFiles({ types: ['public.data'], allowsMultipleSelection: true })
    if (!picked?.length) return
    await this.run(this.t.verifying, async () => {
      const done: string[] = []
      const failed: string[] = []
      for (const p of picked) {
        try { done.push((await importRom(p)).game) } catch (e) { failed.push(`${safeFileName(p)}: ${(e as Error).message}`) }
      }
      DocumentPicker.stopAcessingSecurityScopedResources()
      if (failed.length) await Dialog.alert({ title: this.t.importRom, message: failed.join('\n\n') })
      else if (done.length) await Dialog.alert({ title: this.t.romReady, message: done.map((g) => gameInfo(g)?.title ?? g).join(', ') })
    })
  }

  async removeRom(game: GameId) {
    if (await Dialog.confirm({ message: `${gameInfo(game)?.title}: ROM + imported data?`, confirmLabel: this.t.remove, cancelLabel: this.t.cancel })) {
      await removeRom(game)
      await removeCache(game)
      await this.refresh()
    }
  }

  async resetCache(game: GameId) {
    await removeCache(game)
    await this.refresh()
  }

  // ---------------------------------------------------------------- play
  /** Decide how to start a game: boot from cache, or import from the ROM first. */
  planLaunch(game: GameId, slot?: string): { request: LaunchRequest; rom?: StoredRom } | { problem: string } {
    const info = gameInfo(game)
    if (!info) return { problem: 'Unknown game' }
    if (!info.supported) return { problem: this.t.notSupported }
    if (!this.state.runtime?.installed) return { problem: `${this.t.runtime}: ${this.t.notInstalled}` }
    if (!this.state.game) return { problem: `${this.t.gameFiles}: ${this.t.notInstalled}` }
    const cache = this.state.caches[game]
    const rom = this.state.roms[game]
    if (cache && cache.gameVersion === this.state.game.version) return { request: { game, slot } }
    if (rom) return { request: { game, importRomPath: `/rd/rom/${game}.${rom.ext}` }, rom }
    return { problem: `${info.title}: ${this.t.romMissing}` }
  }

  async play(game: GameId, slot?: string, present?: (session: PlayerSession) => Promise<void>) {
    const plan = this.planLaunch(game, slot)
    if ('problem' in plan) {
      await Dialog.alert({ title: gameInfo(game)?.title ?? game, message: plan.problem })
      return
    }
    const s = this.state
    if (!s.runtime || !s.game) return
    let session: PlayerSession | undefined
    await this.run(this.t.checking, async () => {
      if (s.settings.autoBackup) await backupNow('auto', s.settings.backupsToKeep)
      session = await PlayerSession.prepare({
        request: plan.request,
        settings: s.settings,
        runtime: s.runtime!,
        game: s.game!,
        romPath: 'rom' in plan && plan.rom ? plan.rom.path : undefined,
        romName: 'rom' in plan && plan.rom ? `${game}.${plan.rom.ext}` : undefined,
        onEvent: (e: SessionEvent) => this.onSessionEvent(e),
        confirmOpenURL: (url) => Dialog.confirm({ title: this.t.openLinkTitle, message: url, confirmLabel: this.t.ok, cancelLabel: this.t.cancel }),
      })
      await session.start()
    })
    if (!session) return
    setShared('lastPlayed', { game, slot: slot ?? null, at: Date.now() })
    try {
      if (present) await present(session)
    } finally {
      await session.close()
      this.set({ lastSession: { stats: session.stats, error: session.lastError, endedAt: new Date().toISOString() } })
      await this.refresh()
    }
  }

  private onSessionEvent(e: SessionEvent) {
    if (e.kind === 'status') this.set({ busy: e.text })
    if (e.kind === 'cacheStored') void this.refresh()
  }

  // ---------------------------------------------------------------- mods
  async importMod(): Promise<ModCandidate | undefined> {
    const picked = await DocumentPicker.pickFiles({ types: ['public.zip-archive'] })
    if (!picked?.length) return undefined
    const candidate = await this.run(this.t.verifying, () => inspectModZip(picked[0]))
    DocumentPicker.stopAcessingSecurityScopedResources()
    return candidate
  }

  async confirmMod(c: ModCandidate, enable: boolean) {
    await this.run(this.t.install, () => installCandidate(c, enable))
  }

  async rejectMod(c: ModCandidate) {
    await discardCandidate(c)
  }

  async toggleMod(id: string, enabled: boolean) {
    await setModEnabled(id, enabled)
    await this.refresh()
  }

  async deleteMod(id: string) {
    if (await Dialog.confirm({ message: `${this.t.remove}: ${id}?`, confirmLabel: this.t.remove, cancelLabel: this.t.cancel })) {
      await removeMod(id)
      await this.refresh()
    }
  }

  // ---------------------------------------------------------------- saves
  backupNow() {
    return this.run(this.t.backupNow, async () => {
      const path = await backupNow('manual', this.state.settings.backupsToKeep)
      await Dialog.alert({ message: path ? path.slice(path.lastIndexOf('/') + 1) : 'Nothing to back up yet.' })
    })
  }

  exportSaves() {
    return this.run(this.t.exportSaves, async () => {
      const path = await backupNow('export', this.state.settings.backupsToKeep)
      if (!path) { await Dialog.alert({ message: 'Nothing to export yet.' }); return }
      await DocumentPicker.exportFiles({ files: [{ data: await FileManager.readAsData(path), name: path.slice(path.lastIndexOf('/') + 1) }] })
    })
  }

  async importSaves() {
    const picked = await DocumentPicker.pickFiles({ types: ['public.zip-archive'] })
    if (!picked?.length) return
    if (!(await Dialog.confirm({ message: 'Replace ALL current saves with this archive? A backup of the current state is made first.', confirmLabel: this.t.restore, cancelLabel: this.t.cancel }))) return
    await this.run(this.t.importSaves, async () => {
      await backupNow('before-import', 50)
      const tmp = `${DIRS.tmp}/import-${Date.now()}.zip`
      await FileManager.copyFile(picked[0], tmp)
      DocumentPicker.stopAcessingSecurityScopedResources()
      try { await restoreFromZip(tmp) } finally { await removeIfExists(tmp) }
    })
  }

  async restoreBackup(path: string) {
    if (!(await Dialog.confirm({ message: 'Restore this backup? The current state is backed up first.', confirmLabel: this.t.restore, cancelLabel: this.t.cancel }))) return
    await this.run(this.t.restore, async () => {
      await backupNow('before-restore', 50)
      await restoreFromZip(path)
    })
  }

  listBackups() {
    return listBackups()
  }

  // ---------------------------------------------------------------- settings
  updateSettings(patch: Partial<Settings>) {
    const settings = saveSettings({ ...this.state.settings, ...patch })
    this.set({ settings, lang: resolveLang(settings.language, systemLocale()) })
  }

  scriptName() {
    return Script.name
  }
}

export const model = new AppModel()

/** Re-render the calling component whenever the model changes. */
export function useModel(): AppState {
  const [state, setState] = useState<AppState>(model.state)
  useEffect(() => model.subscribe(() => setState(model.state)), [])
  return state
}
