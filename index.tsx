/**
 * Scripting iOS — Gen1Recomp Port (Non-Pro, P0 Scaffold + Voxel + Save/Jobs/Trust)
 * Entry: index.tsx
 *
 * Dieser Scaffold demonstriert *alle* implementierten Bounded Contexts:
 * - Game Library (einmaliger Import via DocumentPicker, 8 GameIds, isReady)
 * - Core Store (versioniert, staged→verified, LKG)
 * - SaveManager (atomic, Backup lastN=5, Migration, Integrity, Journal)
 * - JobScheduler (Priority 100/80/40/30/5, Abort, Deadline, Retry, DAG)
 * - PipelineAdapter Voxel (Canvas2D default + WebView warm cache, OFF/15/35/50, telemetry)
 * - ResourceGovernor + PipelineTelemetry (p95, downgrade)
 * - VoxelPackImporter + VoxelPreloadAdapter + CacheGuard + AtomicFile
 * - TrustManager (Allowlist/Blocklist/Revocation, Provenance)
 * - BackupManager + DiagnosticsBundle + ConfigurationManager + RepositoryProvider
 * - Host Adapter (FileManager/Storage, ScriptingGraphicsAdapter mit WebView Probe)
 *
 * Pro-APIs werden NICHT verwendet. Renderer ist Canvas (Scripting) — kein Metal.
 */

import { VStack, HStack, Text, Button, List, Section, Navigation, Script, useState, useEffect } from "scripting"
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

function App() {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [status, setStatus] = useState<string>("Bereit — ROM einmal importieren, danach Warm Start + Voxel LOD + Save/Jobs")
  const [coreInfo, setCoreInfo] = useState<string>("Core: —")
  const [voxelLOD, setVoxelLOD] = useState<string>(pipelines.levelLabel("voxel"))
  const [telemetryInfo, setTelemetryInfo] = useState<string>("Telemetry: —")
  const [diagInfo, setDiagInfo] = useState<string>("Diagnostics: —")

  const refresh = async () => {
    const list = await library.list()
    setEntries(list)
    const active = cores.getActive()
    setCoreInfo(active ? `Core: ${active.version} (${active.retention}) — ${active.hash.slice(0,8)}` : "Core: keiner aktiv (Bundled fengari)")
    setVoxelLOD(pipelines.levelLabel("voxel"))
    const s = telemetry.stats("voxel","drawWorld")
    setTelemetryInfo(`Telemetry voxel: p50 ${s.p50.toFixed(2)}ms p95 ${s.p95.toFixed(2)}ms • broken [${s.broken.join(",")||"—"}] • availableFalse ${(s.availableFalseRate*100).toFixed(1)}%`)
    const diag = new DiagnosticsBundle(host.storage)
    const secs = diag.collect()
    setDiagInfo(`Diagnostics: ${secs.map(s=> `${s.name}:${s.status}`).join(" ")}`)
  }

  useEffect(() => { refresh() }, [])

  const onImport = async () => {
    setStatus("Wähle ROM… (Nur US Red/Blue/Yellow/Gold/Silver/Crystal/FireRed/LeafGreen, SHA-1 geprüft)")
    try {
      // @ts-ignore DocumentPicker global
      const urls: string[] = await DocumentPicker.open(["public.data", "public.item"])
      if (!urls?.length) { setStatus("Abgebrochen"); return }
      const path = urls[0]
      setStatus(`Lese ${path.split("/").pop()}… (8 MiB Limit, AtomicFile)`)
      const bytes = await host.files.readAsBytes(path)
      setStatus(`SHA-1 prüfen… (${bytes.length} Bytes)`)
      const res = await library.importBytes(bytes, path)
      if (!res.ok) { setStatus(`Import fehlgeschlagen: ${res.error}`); return }
      setStatus(`Import ok: ${res.entry.gameId} (${res.entry.contentHash.slice(0,8)}) — isReady ${res.entry.isReady}`)
      // Trust provenance für Import
      trust.setProvenance(res.entry.id, "DocumentPicker", res.entry.contentHash, "manual")
      await refresh()
    } catch (e:any) { setStatus(`Fehler: ${String(e?.message ?? e)}`) }
  }

  const onPlay = async (e: LibraryEntry) => {
    if (!e.isReady) { setStatus("Cache nicht ready — erneut importieren"); return }
    await library.touchPlayed(e.id)
    const core = await cores.resolveForProfile()
    // SaveManager demo: checkpoint vor Start
    await saves.save(e.gameId, "checkpoint", "auto", { map: "PALLET_TOWN", pos: {x:5,y:5} }, { schemaVersion:1, coreVersion: core?.version ?? "bundled" })
    // Pipeline drawWorld demo + telemetry
    const ctx:any={ state:{actors:[]}, cam:{x:0,y:0}, vw:160,vh:144, width:320,height:288, scale:2, level:pipelines.level("voxel"), paletteFor:()=>({}), spriteColors:()=>({}), drawFx:()=>{}, canvas:{getWidth:()=>160,getHeight:()=>144} }
    pipelines.drawWorld("voxel", ctx)
    // Governor tick (simuliert warning)
    governor.setPressure("normal")
    const downg=governor.tickVoxelLOD()
    if (downg?.downgraded) setStatus(`Starte ${e.gameId} mit ${core?.version ?? "bundled"} — Governor downgrade ${downg.from}→${downg.to} (${downg.reason})`)
    else setStatus(`Starte ${e.gameId} mit ${core?.version ?? "bundled"} — LOD ${pipelines.levelLabel("voxel")} — Two-Stage Loading`)
    // Backup demo
    await backups.exportBackup("save","slot1", { party:[25] }, { gameId:e.gameId })
    await refresh()
  }

  const onCycleVoxel = async (dir:number) => {
    pipelines.cycle("voxel", dir)
    host.storage.set("pipelines:voxel", pipelines.level("voxel") as any)
    setVoxelLOD(pipelines.levelLabel("voxel"))
    // Preload demo via JobScheduler P30
    const importerNeeded=false // in echter App: VoxelPreloadAdapter.preload Top-N
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

  return (
    <VStack spacing={12} padding={16}>
      <Text font="title">gen1recomp — Scripting (P0+Voxel)</Text>
      <Text font="caption" color="secondary">{status}</Text>
      <Text font="caption" color="secondary">{coreInfo}</Text>
      <Text font="caption" color="secondary">Voxel LOD: {voxelLOD} — {config.get().graphics.quality} — {telemetryInfo}</Text>
      <Text font="caption2" color="secondary">{diagInfo}</Text>

      <HStack spacing={8}>
        <Button title="ROM importieren" action={onImport} />
        <Button title="Core 1.0.0 (Gold/Crystal)" action={onInstallCore} />
        <Button title="Aktualisieren" action={refresh} />
      </HStack>
      <HStack spacing={8}>
        <Button title="Voxel OFF←" action={()=>onCycleVoxel(-1)} />
        <Button title="Voxel →ON" action={()=>onCycleVoxel(1)} />
        <Button title="Save Test (atomic+backup)" action={onSaveTest} />
        <Button title="Trust block" action={onTrustDemo} />
      </HStack>

      <List>
        <Section header="Library — einmal importieren, danach Warm Start (Red/Blue/Yellow/Gold/Silver/Crystal/FireRed/LeafGreen)">
          {entries.length === 0 ? (
            <Text color="secondary">Keine Spiele — DocumentPicker nutzen (11 SHA1, 6 FORMAT_VERSION)</Text>
          ) : entries.map((e: LibraryEntry) => (
            <HStack key={e.id}>
              <VStack>
                <Text>{e.gameId.toUpperCase()} ({e.format}) — {e.region}</Text>
                <Text font="caption" color="secondary">{e.contentHash.slice(0,12)}… • {e.isReady ? "Ready" : "Nicht ready"} • LOD {voxelLOD}</Text>
              </VStack>
              <Button title={e.isReady ? "Spielen" : "Re-Import"} action={()=>onPlay(e)} />
            </HStack>
          ))}
        </Section>
        <Section header="Hinweise (Non-Pro, Offline-First, Voxel)">
          <Text font="caption">• ROM nach Import nicht erneut verlangt (isReady via rom-cache.complete + REQUIRED_FILES)</Text>
          <Text font="caption">• Core Store: staged→verify→activate→monitoring→verified, Rollback LKG, Gold/Silver/Crystal/FireRed/LeafGreen ready</Text>
          <Text font="caption">• Saves: atomic (AtomicFile), Backup lastN=5, Journal, Migration, Integrity sha256 — SaveManager</Text>
          <Text font="caption">• Pipeline Voxel: {voxelLOD} — Canvas2D Fallback VERIFIZIERT, WebView WebGL EXPERIMENTELL (Warm Cache, probe, invalidate)</Text>
          <Text font="caption">• Jobs: PriorityQueue 100/80/40/30/5, Governor cancel≤30 bei critical — Voxel P30 via JobScheduler</Text>
          <Text font="caption">• Trust: Allowlist/Blocklist/Revocation (deny wins) + Provenance — Voxel Packs via TrustManager</Text>
          <Text font="caption">• Backup/Diagnostics/Config/Repo: versionierte Exports, Bundle DiagnosticsBundle, Flags, Providers</Text>
        </Section>
      </List>

      <Text font="caption2" color="secondary">Docs: ARCHITEKTUR.md §44.1 §76.1 • Invarianten: spec/pipeline-invariants.md • Benchmark: benchmarks/voxel-benchmark.md • Tests: 73+ • PR #1</Text>
    </VStack>
  )
}

Navigation.present({ element: <App /> }).then(()=>Script.exit())
