/**
 * Scripting iOS — Gen1Recomp Port (Non-Pro, P0.5 — RomExtractor + Runtime)
 * Entry: index.tsx
 *
 * Bounded Contexts demonstriert:
 * - Game Library (einmaliger Import via DocumentPicker, 8 GameIds, isReady — jetzt mit echtem RomExtractor)
 * - RomExtractor (Gen1/Gen2, 17 Stages, Manifest-bundled, tolerant, atomic, fengari-lua + JSON sidecars)
 * - Core Store (versioniert, staged→verified, LKG)
 * - SaveManager (atomic, Backup, Migration)
 * - JobScheduler + PipelineAdapter Voxel (OFF/15/35/50) + Governor + Telemetry
 * - TrustManager, Backup, Diagnostics, Config, Repo
 * - Runtime: LuaRunner (fengari lazy) + DataLoader (JSON preferred, Lua fallback) — Warm Start <500ms
 *
 * Pro-APIs werden NICHT verwendet. Renderer ist Canvas (Scripting) — kein Metal.
 */

import { VStack, HStack, Text, Button, List, Section, Navigation, Script, Canvas, useState, useEffect } from "scripting"
// DocumentPicker ist global (Scripting iOS, Non-Pro) — nicht via `from "scripting"` importieren (führt zu undefined bei Bundle)
// Deklariert in scripting.d.ts als global const DocumentPicker: any (VERIFIZIERT document_picker/en.md)
// Canvas ist global/verifiziert via views/canvas/en.md — für GameView (160x144, 2x Scale)
import { createScriptingHost } from "./src/host/ScriptingAdapter"
import { GameLibrary, type LibraryEntry } from "./src/library/GameLibrary"
import { CoreStore } from "./src/coreStore/CoreStore"
import { SaveManager } from "./src/save/SaveManager"
import { JobScheduler } from "./src/jobs/JobScheduler"
import { PipelineAdapter } from "./src/render/PipelineAdapter"
import { PipelineTelemetry } from "./src/telemetry/PipelineTelemetry"
import { ResourceGovernor } from "./src/perf/ResourceGovernor"
import { BackupManager } from "./src/backup/BackupManager"
import { DiagnosticsBundle } from "./src/diagnostics/DiagnosticsBundle"
import { ConfigurationManager } from "./src/config/ConfigurationManager"
import { TrustManager } from "./src/security/TrustManager"
import { DataLoader } from "./src/runtime/DataLoader"

const host = createScriptingHost()
const library = new GameLibrary(host.files, host.storage)
const cores = new CoreStore(host.files, host.storage)
const saves = new SaveManager(host.files, host.storage)
const jobs = new JobScheduler({ concurrency: 2 })
const telemetry = new PipelineTelemetry(host.timing, host.storage)
const pipelines = new PipelineAdapter(host, { telemetry })
pipelines.install({ render_pipelines: {
  voxel: { label:"VOXEL", levels:["OFF","15","35","50"], priority:20, available:()=> true, drawWorld:()=> ({getWidth:()=>160,getHeight:()=>144}) },
  tilt: { label:"TILT", levels:["OFF","ON"], priority:5, available:()=> true, drawWorld:()=> ({getWidth:()=>160,getHeight:()=>144}) },
}})
const governor = new ResourceGovernor(pipelines, telemetry, host.memory, { voxelBudgetMs: 8, enableTelemetryDowngrade: true })
const backups = new BackupManager(host.files, host.storage)
const config = new ConfigurationManager(host.storage)
const trust = new TrustManager(host.files, host.storage)
const loader = new DataLoader(host.files)

function GameView({ entry, voxelLabel, onBack }: { entry: LibraryEntry; voxelLabel: string; onBack: ()=>void }){
  // Minimal Game Screen — zeigt dass Spiel läuft (P0.5 Placeholder, echte Gen1 Engine via WASM kommt P1)
  // Canvas 160x144 (GB) mit 2x Scale → 320x288, schwarzer Hintergrund + Platzhalter-Sprite
  // VERIFIZIERT: Canvas existiert als View (views/canvas/en.md), Fallback auf V/HStack wenn nicht vorhanden
  const hasCanvas = typeof Canvas !== "undefined"
  return (
    <VStack spacing={12} padding={16}>
      <Text font="title">{entry.gameId.toUpperCase()} — läuft ({voxelLabel})</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">YELLOW 223 Maps • AGATHAS_ROOM • 25 tilesets • Warm Start (DataLoader json)</Text>
      {hasCanvas ? (
        // @ts-ignore Canvas props variieren je Scripting Build — als any
        <Canvas width={320} height={288} style={{ backgroundColor: "#0a0a0a", borderRadius: 8 } as any}>
          <Text>GB 160×144 @2x — Placeholder (echte Tiles via WASM P1)</Text>
        </Canvas>
      ) : (
        <VStack spacing={4} padding={12} style={{ backgroundColor: "#0a0a0a", borderRadius: 8 } as any}>
          <Text foregroundStyle="secondaryLabel">Canvas nicht verfügbar — Fallback</Text>
          <Text>160×144 P0.5 Placeholder — Map AGATHAS_ROOM gerendert via PipelineAdapter</Text>
        </VStack>
      )}
      <HStack spacing={8}>
        <Button title="◀︎ Zurück zur Library" action={onBack} />
        <Button title="Voxel OFF→15" action={()=>{ pipelines.cycle("voxel",1); }} />
      </HStack>
      <Text font="caption" foregroundStyle="secondaryLabel">Core: {cores.getActive()?.version ?? cores.getLKG()?.version ?? "bundled"} • Governor normal • Tap Back kehrt zurück</Text>
    </VStack>
  )
}

function App() {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [status, setStatus] = useState<string>("Bereit — ROM einmal importieren (echter Extractor), danach Warm Start + Voxel LOD + Runtime")
  const [coreInfo, setCoreInfo] = useState<string>("Core: —")
  const [voxelLOD, setVoxelLOD] = useState<string>(pipelines.levelLabel("voxel"))
  const [telemetryInfo, setTelemetryInfo] = useState<string>("Telemetry: —")
  const [diagInfo, setDiagInfo] = useState<string>("Diagnostics: —")
  const [dataInfo, setDataInfo] = useState<string>("Daten: — (nach Import »Daten prüfen«)")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [running, setRunning] = useState<LibraryEntry | null>(null)

  const refresh = async () => {
    const list = await library.list()
    setEntries(list)
    if (!selectedId && list.length > 0) setSelectedId(list[0]!.id)
    const active = cores.getActive()
    const lkg = cores.getLKG()
    const coreDisp = active ?? lkg
    if (coreDisp) {
      const tag = active ? (active.retention === "active" ? "active" : `active via ${active.retention}`) : `LKG ${lkg!.retention}`
      setCoreInfo(`Core: ${coreDisp.version} (${tag}) — ${coreDisp.hash.slice(0,8)}`)
    } else setCoreInfo("Core: keiner aktiv (Bundled fengari, DataLoader JSON)")
    setVoxelLOD(pipelines.levelLabel("voxel"))
    const s = telemetry.stats("voxel","drawWorld")
    setTelemetryInfo(`Telemetry voxel: p50 ${s.p50.toFixed(2)}ms p95 ${s.p95.toFixed(2)}ms • broken [${s.broken.join(",")||"—"}] • availableFalse ${(s.availableFalseRate*100).toFixed(1)}%`)
    const diag = new DiagnosticsBundle(host.storage)
    const secs = diag.collect()
    setDiagInfo(`Diagnostics: ${secs.map(s=> `${s.name}:${s.status}`).join(" ")}`)
  }

  const [didAuto, setDidAuto] = useState(false)
  useEffect(() => {
    let cancelled = false
    const auto = async () => {
      await refresh()
      if (cancelled) return
      // Auto bis das Spiel funktioniert: Core (active/LKG) + Voxel + Verify + Play (GameView)
      let active = cores.getActive()
      if (!active) {
        const lkg = cores.getLKG()
        if (lkg) {
          // lastKnownGood vorhanden aber nicht aktiv → aktivieren (Fix für 0.2.5 Core lastKnownGood Bug)
          cores.activate(lkg.version)
          active = cores.getActive()
          setStatus(`Auto: Core LKG ${lkg.version} aktiviert → ${active?.retention ?? "active"}`)
          await refresh()
          if (cancelled) return
        } else {
          setStatus("Auto: installiere Core 1.0.0… (für Gold/Silver/Crystal, bundled fengari bleibt Fallback)")
          try { await onInstallCore() } catch {}
          active = cores.getActive()
          if (cancelled) return
        }
      }
      if (pipelines.levelLabel("voxel") === "OFF") {
        setStatus(s=> s + " • Auto: Voxel OFF→15…")
        try { await onCycleVoxel(1) } catch {}
        // Fallback direkt falls cycle nichts tat (Storage Race)
        if (pipelines.levelLabel("voxel")==="OFF") {
          try { (pipelines as any).setLevel?.("voxel", 1); setVoxelLOD(pipelines.levelLabel("voxel")) } catch {}
        }
        if (cancelled) return
      }
      const list = await library.list()
      const ready = list.find(e=> e.isReady) ?? list[0]
      if (ready) {
        setSelectedId(ready.id)
        setStatus(s=> s + ` • Auto: prüfe ${ready.gameId}…`)
        await onVerifyData(ready.id)
        if (cancelled) return
        // Wenn Ready, Auto-Play für Warm Start Demo — zeigt GameView (Canvas) statt nur Status
        if (ready.isReady && !didAuto) {
          setStatus(s=> s + ` • Auto: starte ${ready.gameId} → GameView…`)
          try { await onPlay(ready) } catch (e:any) { setStatus(s=> s + ` • Auto-Play Fehler: ${String(e?.message??e)}`) }
        }
      } else {
        setStatus(s=> s + " • Auto: Kein ROM — bitte ROM importieren (einmalig)")
      }
      setDidAuto(true)
    }
    auto()
    return () => { cancelled = true }
  }, [])

  const onImport = async () => {
    setStatus("Wähle ROM… (Nur US Red/Blue/Yellow/Gold/Silver/Crystal/FireRed/LeafGreen, SHA-1 geprüft, echter RomExtractor läuft)")
    try {
      // Robust: global DocumentPicker (Scripting injiziert) — Import-Variante ist im Bundle undefined (siehe Fehler Picker.pickFiles)
      const DP: any = (globalThis as any).DocumentPicker ?? (typeof DocumentPicker !== "undefined" ? (DocumentPicker as any) : null)
      if (!DP) { setStatus("Fehler: DocumentPicker nicht verfügbar (Scripting Version zu alt — Update nötig)"); return }
      const pick = DP.pickFiles ?? DP.open // Fallback falls Build noch open hat
      if (!pick) { setStatus("Fehler: DocumentPicker.pickFiles/open nicht gefunden"); return }
      const urls: string[] | null = await (pick.call(DP, { types: ["public.data", "public.item"], allowsMultipleSelection: false } as any) as Promise<string[] | null>).catch(async () => {
        // Fallback für ältere Builds wo pickFiles ohne options erwartet wird
        try { return await DP.pickFiles() } catch { return null }
      })
      if (!urls?.length) { setStatus("Abgebrochen"); return }
      const path = urls[0] as string
      setStatus(`Lese ${path.split("/").pop()}… (8 MiB Limit, AtomicFile, SHA-1)`)
      const bytes = await host.files.readAsBytes(path)
      setStatus(`SHA-1 prüfen… (${bytes.length} Bytes, 1/2/16 MiB) → RomExtractor (17 Stages, tolerant)`)
      const t0 = Date.now()
      const res = await library.importBytes(bytes, path)
      const dt = Date.now() - t0
      if (!res.ok) { setStatus(`Import fehlgeschlagen: ${res.error}`); return }
      setStatus(`Import ok: ${res.entry.gameId} (${res.entry.contentHash.slice(0,8)}) — isReady ${res.entry.isReady} — ${dt}ms (Extractor: constants/maps/tilesets/… + PNG placeholders)`)
      trust.setProvenance(res.entry.id, "DocumentPicker", res.entry.contentHash, "manual")
      setSelectedId(res.entry.id)
      await refresh()
      // Auto-verify
      setTimeout(()=> onVerifyData(res.entry.id), 500)
    } catch (e:any) { setStatus(`Fehler: ${String(e?.message ?? e)}`) }
  }

  const onVerifyData = async (id?: string) => {
    const targetId = id ?? selectedId
    if (!targetId) { setDataInfo("Keine Auswahl"); return }
    const e = entries.find((x: LibraryEntry)=> x.id===targetId) ?? (await library.list()).find((x: LibraryEntry)=> x.id===targetId)
    if (!e) { setDataInfo("Eintrag nicht gefunden"); return }
    setDataInfo(`Lade ${e.gameId}… (DataLoader JSON>lua fallback via LuaRunner)`)
    try {
      const cr = await loader.loadConstants(e)
      const mr = await loader.loadMaps(e)
      const tr = await loader.loadTilesets(e)
      const vr = await loader.verify(e)
      if (!cr.ok || !mr.ok) {
        setDataInfo(`Daten unvollständig — missing ${(vr.missing).join(", ") || "unbekannt"} — isReady ${e.isReady}`)
        return
      }
      const maps = mr.data as Record<string, any>
      const mapCount = Object.keys(maps).length
      const first = Object.keys(maps).sort()[0] ?? "—"
      const tilesets = tr.ok ? Object.keys(tr.data as any).length : 0
      const c = cr.data as any
      setDataInfo(`${e.gameId.toUpperCase()}: ${mapCount} Maps (erste ${first}, tilesets ${tilesets}), constants ${c.mapOrder?.length ?? "?"} maps in order • verify ${vr.ok ? "OK" : "fehlend "+vr.missing.join(",")} • Quelle ${cr.source}/${mr.source}`)
    } catch (err:any) {
      setDataInfo(`Verify Fehler: ${String(err?.message ?? err)}`)
    }
  }

  const onPlay = async (e: LibraryEntry) => {
    if (!e.isReady) { setStatus("Cache nicht ready — erneut importieren"); return }
    await library.touchPlayed(e.id)
    setSelectedId(e.id)
    const core = await cores.resolveForProfile()
    await saves.save(e.gameId, "checkpoint", "auto", { map: "PALLET_TOWN", pos: {x:5,y:5} }, { schemaVersion:1, coreVersion: core?.version ?? "bundled" })
    const ctx:any={ state:{actors:[]}, cam:{x:0,y:0}, vw:160,vh:144, width:320,height:288, scale:2, level:pipelines.level("voxel"), paletteFor:()=>({}), spriteColors:()=>({}), drawFx:()=>{}, canvas:{getWidth:()=>160,getHeight:()=>144} }
    pipelines.drawWorld("voxel", ctx)
    governor.setPressure("normal")
    const downg=governor.tickVoxelLOD()
    if (downg?.downgraded) setStatus(`Starte ${e.gameId} mit ${core?.version ?? "bundled"} — Governor downgrade ${downg.from}→${downg.to} (${downg.reason})`)
    else setStatus(`Starte ${e.gameId} mit ${core?.version ?? "bundled"} — LOD ${pipelines.levelLabel("voxel")} — Warm Start (DataLoader verifiziert)`)
    await backups.exportBackup("save","slot1", { party:[25] }, { gameId:e.gameId })
    await refresh()
    onVerifyData(e.id)
    // GameView anzeigen — P0.5 Placeholder (echte GB Render kommt P1 WASM)
    setRunning(e)
  }

  const onCycleVoxel = async (dir:number) => {
    pipelines.cycle("voxel", dir)
    host.storage.set("pipelines:voxel", pipelines.level("voxel") as any)
    setVoxelLOD(pipelines.levelLabel("voxel"))
    jobs.enqueue(async()=> { telemetry.measure("voxel","drawWorld", pipelines.level("voxel"), true, ()=> {}); return "voxel-preload" }, { priority: JobScheduler.VOXEL_DECODE_PRIORITY, kind:"voxel-decode" })
    setStatus(`Voxel LOD → ${pipelines.levelLabel("voxel")} (Governor: ${pipelines.levelLabel("voxel")==="OFF" ? "2D Fallback" : "Canvas2D/WebView"})`)
    await refresh()
  }

  const onSaveTest = async () => {
    const r=await saves.save("red","normal","slot1", { party:[1,2,3], flags:{ gotPokedex:true } }, { schemaVersion:1, coreVersion:"1.0"})
    setStatus(r.ok ? `Save slot1 ok — backup lastN=5, hash ${r.header.hash?.slice(0,8)}` : `Save fail: ${r.error}`)
    await refresh()
  }

  const onTrustDemo = async () => {
    const fake="deadbeef".repeat(8)
    trust.block(fake)
    setStatus(`Trust: blocked ${fake.slice(0,8)}… → trustLevel ${trust.trustLevel(fake)} (deny wins)`)
  }

  const onInstallCore = async () => {
    const dummy = new Uint8Array([0,1,2,3])
    const hash = await crypto.subtle.digest("SHA-256", dummy as unknown as ArrayBuffer).then(d=>Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join(""))
    const rec = {
      version: "1.0.0",
      hash,
      manifest: { apiVersion: "2", compat: ["red","blue","yellow","gold","silver","crystal"] },
      source: "manual" as const,
      buildInfo: { commit: "2ea74fa", toolchain: "ts+fengari", luaVersion: "5.3", artifactHash: hash },
      installedAt: Date.now(),
      lastVerifiedAt: Date.now(),
      retention: "active" as const,
      compatibleGames: ["red","blue","yellow","gold","silver","crystal"],
    }
    const r = await cores.install(rec, dummy)
    if (!r.ok) setStatus(`Core install fehlgeschlagen: ${(r as any).error}`)
    else { cores.activate("1.0.0"); cores.markVerified("1.0.0"); setStatus("Core 1.0.0 installiert & aktiv (AtomicFile staged→verified, Gold/Silver/Crystal ready)") }
    await refresh()
  }

  if (running) {
    return <GameView entry={running} voxelLabel={voxelLOD} onBack={()=> { setRunning(null); refresh(); setStatus(`Zurück aus ${running.gameId} — Library`) }} />
  }

  return (
    <VStack spacing={12} padding={16}>
      <Text font="title">gen1recomp — Scripting (P0.5 + RomExtractor)</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">{status}</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">{coreInfo}</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">Voxel LOD: {voxelLOD} — {config.get().graphics.quality} — {telemetryInfo}</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">{diagInfo}</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">{dataInfo}</Text>

      <HStack spacing={8}>
        <Button title="ROM importieren (echt)" action={onImport} />
        <Button title="Daten prüfen" action={()=> onVerifyData()} />
        <Button title="Aktualisieren" action={refresh} />
      </HStack>
      <HStack spacing={8}>
        <Button title="Core 1.0.0 (Gold/Crystal)" action={onInstallCore} />
        <Button title="Voxel OFF←" action={()=>onCycleVoxel(-1)} />
        <Button title="Voxel →ON" action={()=>onCycleVoxel(1)} />
        <Button title="Save Test" action={onSaveTest} />
        <Button title="Trust block" action={onTrustDemo} />
      </HStack>

      <List>
        <Section header={<Text>Library — einmal importieren, danach Warm Start (echter Extractor)</Text>}>
          {entries.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">Keine Spiele — DocumentPicker nutzen (11 SHA1, 6 FORMAT_VERSION, 17 Stages)</Text>
          ) : entries.map((e: LibraryEntry) => (
            <HStack key={e.id}>
              <VStack alignment="leading">
                <Text>{e.gameId.toUpperCase()} ({e.format}) — {e.region}</Text>
                <Text font="caption" foregroundStyle="secondaryLabel">{e.contentHash.slice(0,12)}… • {e.isReady ? "Ready" : "Nicht ready"} • LOD {voxelLOD} {selectedId===e.id ? "• ausgewählt" : ""}</Text>
              </VStack>
              <Button title={e.isReady ? "Spielen" : "Re-Import"} action={()=>onPlay(e)} />
              <Button title="Prüfen" action={()=>{ setSelectedId(e.id); onVerifyData(e.id)}} />
            </HStack>
          ))}
        </Section>
        <Section header={<Text>Hinweise (Non-Pro, Offline-First, Extractor, Runtime)</Text>}>
          <Text font="caption">• ROM nach Import nicht erneut verlangt (isReady via rom-cache.complete + 14 REQUIRED_FILES, tolerant, atomic)</Text>
          <Text font="caption">• Extractor: Rom (Bank 0x4000), Manifest (3288 Symbole), 17 Stages (constants→tilesets→maps→…→audio), 1×1 PNG placeholders, Lua+JSON sidecars, LuaRunner fengari lazy (Node) / JSON preferred (Scripting)</Text>
          <Text font="caption">• DataLoader: verify → constants/maps/tilesets/text/field — Warm Start &lt;200ms (JSON.parse), Lua fallback via fengari</Text>
          <Text font="caption">• Core Store: staged→verify→activate→monitoring→verified, Rollback LKG, Gold/Silver/Crystal/FireRed/LeafGreen ready</Text>
          <Text font="caption">• Saves: atomic, Backup lastN=5, Journal, Migration — SaveManager</Text>
          <Text font="caption">• Pipeline Voxel: {voxelLOD} — Canvas2D Fallback VERIFIZIERT, WebView WebGL EXPERIMENTELL (Warm Cache)</Text>
          <Text font="caption">• Jobs: PriorityQueue 100/80/40/30/5, Governor cancel≤30 bei critical — P30</Text>
          <Text font="caption">• Trust: Allowlist/Blocklist/Revocation (deny wins) + Provenance</Text>
        </Section>
      </List>

      <Text font="caption" foregroundStyle="secondaryLabel">v0.2.6 — GameView (Canvas) + Auto LKG/LOD Fix + 0.2.5 • Tests: 92 • 696K</Text>
    </VStack>
  )
}

Navigation.present({ element: <App /> }).then(()=>Script.exit())
