// A player session: prepares the WebView runtime directory, publishes all
// blobs/packs, owns the WebViewController and the bridge endpoint.
//
// Security: the WebView is ephemeral, may only navigate inside the player
// directory, gets a strict CSP (player.html) and every message it posts is
// schema-validated (core/bridgeSchema.ts) before anything happens.
// SPDX-License-Identifier: GPL-3.0-or-later

import { Script } from 'scripting'
import { BRIDGE_MOD_ID, GAME_IDENTITY, GameId } from '../core/constants'
import { parseBridgeMessage } from '../core/bridgeSchema'
import { buildLaunchPlan, LaunchRequest } from '../core/launch'
import { classifySavePath, isFileUrlInside, isSafeRelPath } from '../core/paths'
import type { Settings } from '../core/settings'
import { appendCachePart, beginCache, cacheMeta, cachePath, endCache } from '../data/cacheStore'
import { listMods } from '../data/modStore'
import { applyUserBatch, pendingWrites } from '../data/saveStore'
import { DIRS, ensureDir, exists, removeIfExists } from '../platform/fs'
import { playHaptic } from '../platform/haptics'
import { log } from '../platform/log'
import type { RuntimeStatus } from '../runtime/runtimeManager'
import type { InstalledGame } from '../runtime/gameManager'
import { BlobDesc, buildPackData, directorySources, PackSource, publishBlob, publishFile, pruneBlobs } from './blobs'

export type SessionEvent =
  | { kind: 'status'; text: string }
  | { kind: 'ready' }
  | { kind: 'quit'; toLauncher: boolean }
  | { kind: 'error'; message: string; details?: string }
  | { kind: 'engineFault'; message: string }
  | { kind: 'cacheStored'; game: string }
  | { kind: 'stats'; data: Record<string, unknown> }

export interface SessionInput {
  request: LaunchRequest
  settings: Settings
  runtime: RuntimeStatus
  game: InstalledGame
  /** Absolute path of a verified ROM to stage for a headless import. */
  romPath?: string
  romName?: string
  onEvent: (e: SessionEvent) => void
  confirmOpenURL: (url: string) => Promise<boolean>
}

const WEB_FILES = ['player.html', 'player.js', 'player.css']

export class PlayerSession {
  readonly controller: WebViewController
  private input: SessionInput
  private closed = false
  private cacheTarget: string | null = null
  stats: Record<string, unknown> = {}
  lastError: string | null = null
  private listener: ((e: SessionEvent) => void) | null = null

  /** Attach the view that currently shows this session. */
  setListener(fn: ((e: SessionEvent) => void) | null) {
    this.listener = fn
  }

  private emit(e: SessionEvent) {
    try { this.input.onEvent(e) } catch (err) { log('warn', 'session onEvent: ' + String(err)) }
    try { this.listener?.(e) } catch (err) { log('warn', 'session listener: ' + String(err)) }
  }

  private constructor(input: SessionInput) {
    this.input = input
    this.controller = new WebViewController({ ephemeral: true })
  }

  static async prepare(input: SessionInput): Promise<PlayerSession> {
    const s = new PlayerSession(input)
    await s.build()
    return s
  }

  private status(text: string) {
    this.emit({ kind: 'status', text })
  }

  private async build() {
    const { settings, runtime, game, request } = this.input
    await ensureDir(DIRS.player)
    this.status('Preparing player…')
    const src = Script.directory + '/runtime'
    for (const f of WEB_FILES) {
      await removeIfExists(`${DIRS.player}/${f}`)
      await FileManager.copyFile(`${src}/web/${f}`, `${DIRS.player}/${f}`)
    }
    await removeIfExists(`${DIRS.player}/love.js`)
    await FileManager.copyFile(runtime.loveJs, `${DIRS.player}/love.js`)

    const used = new Set<string>()
    const pub = async (p: Promise<BlobDesc>) => { const d = await p; used.add(d.sha256); return d }

    this.status('Publishing runtime…')
    const wasm = await pub(publishFile(runtime.loveWasm, runtime.wasmSha256))
    this.status('Publishing game archive…')
    const archive = await pub(publishFile(game.path, game.sha256))

    // Lua bootstrap (-> /rd/host)
    const hostPack = await pub(publishBlob(await buildPackData(await directorySources(`${src}/lua`, ''))))

    // save directory: user data + installed mods + platform bridge mod
    this.status('Packing saves and mods…')
    const saveSources: PackSource[] = await directorySources(DIRS.save, '', (rel) => isSafeRelPath(rel) && classifySavePath(rel).kind === 'user')
    const mods = (await listMods()).filter((m) => m.enabled)
    for (const m of mods) saveSources.push(...(await directorySources(`${DIRS.mods}/${m.id}`, `mods/${m.id}/`)))
    saveSources.push(...(await directorySources(`${src}/mods/${BRIDGE_MOD_ID}`, `mods/${BRIDGE_MOD_ID}/`)))
    const savePack = await pub(publishBlob(await buildPackData(saveSources)))

    const packs: { id: string; dest: 'host' | 'save'; blob: BlobDesc }[] = [
      { id: 'host', dest: 'host', blob: hostPack },
      { id: 'save', dest: 'save', blob: savePack },
    ]
    const files: { dest: 'rd' | 'save'; path: string; blob: BlobDesc }[] = []

    if (request.game && !request.importRomPath) {
      const meta = await cacheMeta(request.game)
      if (meta) packs.push({ id: 'cache', dest: 'save', blob: await pub(publishFile(cachePath(request.game), meta.sha256)) })
    }
    if (request.importRomPath && this.input.romPath && this.input.romName) {
      files.push({ dest: 'rd', path: `rom/${this.input.romName}`, blob: await pub(publishFile(this.input.romPath)) })
      this.cacheTarget = request.game ?? null
    }

    const plan = buildLaunchPlan(request, settings)
    const config = {
      version: 1,
      transport: 'chunks',
      memoryMB: settings.memoryMB,
      fpsCap: settings.fpsCap,
      highdpi: settings.highdpi,
      pixelated: settings.pixelated,
      fillEdges: settings.fillEdges,
      autoStart: false,
      identity: plan.identity,
      args: plan.args,
      env: plan.env,
      platform: { os: settings.reportOS },
      runtime: { loveJs: { src: 'love.js' }, loveWasm: wasm },
      game: archive,
      packs,
      files,
      verify: true,
      statsInterval: 5000,
      selftest: settings.debug,
      perf: settings.debug,
      debug: settings.debug,
    }
    await FileManager.writeAsString(`${DIRS.player}/config.js`, `window.RD_CONFIG = ${JSON.stringify(config)};\n`)
    await pruneBlobs(used)
    log('info', `session prepared: ${JSON.stringify({ args: plan.args, game: game.version, mods: mods.map((m) => m.id) })}`)
  }

  async start() {
    const playerDir = DIRS.player
    this.controller.shouldAllowRequest = async (req) => {
      const url = req.url || ''
      if (url === 'about:blank') return true
      if (url.startsWith('file:')) return isFileUrlInside(url, playerDir)
      log('warn', 'blocked WebView request: ' + url.slice(0, 200))
      if (/^https:\/\//i.test(url) && req.navigationType === 'linkActivated') {
        void this.openExternal(url)
      }
      return false
    }
    await this.controller.addScriptMessageHandler('rd', (raw: unknown) => {
      this.onMessage(raw)
      return true
    })
    const ok = await this.controller.loadFile(`${playerDir}/player.html`, playerDir)
    if (!ok) throw new Error('The player page could not be loaded.')
  }

  private async openExternal(url: string) {
    if (await this.input.confirmOpenURL(url)) await Safari.openURL(url)
  }

  private onMessage(raw: unknown) {
    if (this.closed) return
    const msg = parseBridgeMessage(raw)
    if (!msg) { log('warn', 'rejected bridge message'); return }
    const emit = (e: SessionEvent) => this.emit(e)
    switch (msg.topic) {
      case 'log':
        log(msg.data.level, 'player: ' + msg.data.text)
        break
      case 'stage':
        log('info', 'stage ' + msg.data.stage)
        break
      case 'ready':
        emit({ kind: 'ready' })
        break
      case 'error':
        this.lastError = msg.data.message
        log('error', 'game error: ' + msg.data.message)
        emit({ kind: 'error', message: msg.data.message, details: msg.data.traceback })
        break
      case 'engineFault':
        log('error', 'engine fault: ' + msg.data.message)
        emit({ kind: 'engineFault', message: msg.data.message })
        break
      case 'quit':
        emit({ kind: 'quit', toLauncher: false })
        break
      case 'quitToLauncher':
        emit({ kind: 'quit', toLauncher: true })
        break
      case 'haptic':
        if (this.input.settings.haptics) playHaptic(msg.data.style)
        break
      case 'openURL':
        void this.openExternal(msg.data.url)
        break
      case 'persist.user':
        void applyUserBatch(msg.data)
        break
      case 'persist.cache.begin':
        void beginCache(msg.data.version, msg.data.size, msg.data.parts, msg.data.sha256, this.input.game.version)
          .catch((e) => log('error', 'cache begin: ' + String(e)))
        break
      case 'persist.cache.part':
        void appendCachePart(msg.data.version, msg.data.index, msg.data.b64).catch((e) => log('error', 'cache part: ' + String(e)))
        break
      case 'persist.cache.end':
        void endCache(msg.data.version)
          .then(() => emit({ kind: 'cacheStored', game: msg.data.version }))
          .catch((e) => log('error', 'cache end: ' + String(e)))
        break
      case 'stats':
      case 'perf':
        this.stats = { ...this.stats, ...msg.data }
        emit({ kind: 'stats', data: msg.data })
        break
      default:
        log('info', `${msg.topic}: ${JSON.stringify(msg.data).slice(0, 500)}`)
    }
  }

  private async send(topic: string, data?: unknown): Promise<unknown> {
    try {
      return await this.controller.evaluateJavaScript(`return window.RD && window.RD.receive(${JSON.stringify(topic)}, ${JSON.stringify(data ?? null)})`)
    } catch (e) {
      log('warn', `send ${topic} failed: ${String(e)}`)
      return null
    }
  }

  pause() { return this.send('pause') }
  resume() { return this.send('resume') }
  setFpsCap(cap: number) { return this.send('setFpsCap', cap) }
  requestStats() { return this.send('stats') }
  async playerLogs(): Promise<string[]> {
    const v = await this.send('logs')
    return Array.isArray(v) ? v.map(String) : []
  }

  /** Flush the game's pending writes, wait for them to land, then dispose. */
  async close() {
    if (this.closed) return
    await this.send('flush')
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 700))
    this.closed = true
    await pendingWrites()
    try { this.controller.dispose() } catch { /* already gone */ }
    log('info', 'session closed')
  }

  get importingGame(): string | null {
    return this.cacheTarget
  }
}

export async function cleanupPlayerDir() {
  if (await exists(`${DIRS.player}/config.js`)) await removeIfExists(`${DIRS.player}/config.js`)
}

export function saveRootForDisplay() {
  return `${DIRS.save} (${GAME_IDENTITY})`
}

export type { GameId }
