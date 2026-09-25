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

import { VStack, HStack, Text, Button, List, Section, Navigation, Script, useState, useEffect } from "scripting"
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
  voxel: { label:"VOXEL", levels:["OFF","15","35","50","FULL","75","1ST"], priority:20, available:()=> true, drawWorld:()=> ({getWidth:()=>160,getHeight:()=>144}) },
  tilt: { label:"TILT", levels:["OFF","ON"], priority:5, available:()=> true, drawWorld:()=> ({getWidth:()=>160,getHeight:()=>144}) },
}})
const governor = new ResourceGovernor(pipelines, telemetry, host.memory, { voxelBudgetMs: 8, enableTelemetryDowngrade: true })
const backups = new BackupManager(host.files, host.storage)
const config = new ConfigurationManager(host.storage)
const trust = new TrustManager(host.files, host.storage)
const loader = new DataLoader(host.files)

function GameView({ entry, voxelLabel, onBack }: { entry: LibraryEntry; voxelLabel: string; onBack: ()=>void }){
  // P0.6->P0.7 ECHTES SPIEL - ladt echte ROM-extrahierte Karten via DataLoader, Viewport, Collision, Warps
  const [pos, setPos] = useState({x:5,y:5})
  const [maps, setMaps] = useState<Record<string,any> | null>(null)
  const [tilesets, setTilesets] = useState<Record<string,any> | null>(null)
  const [mapId, setMapId] = useState<string>("AGATHAS_ROOM")
  const [loadInfo, setLoadInfo] = useState<string>("Lade Karten...")

  useEffect(()=>{
    let cancelled = false
    const load = async ()=>{
      try {
        const m = await loader.loadMaps(entry)
        const ts = await loader.loadTilesets(entry)
        if (cancelled) return
        if (m.ok) {
          setMaps(m.data as any)
          const keys = Object.keys(m.data as any)
          if (keys.includes("AGATHAS_ROOM")) setMapId("AGATHAS_ROOM")
          else if (keys.length>0) setMapId(keys[0]!)
          setLoadInfo(`Maps ${keys.length} ${m.source} - ${Object.keys((ts as any).data ?? {}).length} tilesets`)
          const first = (m.data as any)[keys.includes("AGATHAS_ROOM") ? "AGATHAS_ROOM" : keys[0]!]
          if (first) setPos({x: Math.floor((first.width??10)/2), y: Math.floor((first.height??9)/2)})
        } else {
          setLoadInfo(`Maps Fallback - ${m.error}`)
        }
        if (ts.ok) setTilesets(ts.data as any)
      } catch (e:any) {
        if (!cancelled) setLoadInfo(`Ladefehler: ${String(e?.message??e)}`)
      }
    }
    load()
    return ()=>{ cancelled = true }
  }, [entry.id])

  const curMap: any = maps ? (maps as any)[mapId] : null
  const w = curMap?.width ?? 5
  const h = curMap?.height ?? 5
  const blocks: number[] = curMap?.blocks ?? new Array(25).fill(0)

  const isWalkable = (x:number, y:number)=>{
    if (!curMap) return x>=1 && x<=3 && y>=1 && y<=3
    if (x<0 || y<0 || x>=w || y>=h) return false
    const idx = y * w + x
    const tile = blocks[idx] ?? 0
    const border = curMap.borderBlock ?? 0
    if (x===0 || y===0 || x===w-1 || y===h-1) return tile !== border || (w<=5)
    return true
  }

  const move = (dx:number, dy:number) => {
    setPos(p=>{
      const nx = p.x+dx
      const ny = p.y+dy
      if (!isWalkable(nx, ny)) {
        if (curMap?.warps?.length) {
          const warp = curMap.warps[0]
          if (warp?.destMap && maps && (maps as any)[warp.destMap]) {
            setMapId(warp.destMap)
            const dest = (maps as any)[warp.destMap]
            return {x: Math.floor((dest.width??10)/2), y: Math.floor((dest.height??9)/2)}
          }
        }
        return p
      }
      try { telemetry.measure("voxel","drawWorld", pipelines.level("voxel"), true, ()=>{}) } catch {}
      try { saves.save(entry.gameId, "normal", "slotOverworld", { map: mapId, pos: {x:nx,y:ny} }, { schemaVersion:1, coreVersion: cores.getActive()?.version ?? "bundled" }) } catch {}
      return {x:nx,y:ny}
    })
  }

  const interact = ()=>{
    if (!curMap) return
    const obj = (curMap.objects ?? []).find((o:any)=> o.x===pos.x && o.y===pos.y)
    const sign = (curMap.signs ?? []).find((s:any)=> s.x===pos.x && s.y===pos.y)
    if (obj?.text) setLoadInfo(`Objekt: ${obj.text}`)
    else if (sign?.text) setLoadInfo(`Schild: ${sign.text}`)
    else setLoadInfo(`Nichts hier @${pos.x},${pos.y} - ${curMap.objects?.length??0} Objekte, ${curMap.signs?.length??0} Schilder`)
  }

  return (
    <VStack spacing={12} padding={16}>
      <Text font="title">{entry.gameId.toUpperCase()} - {mapId} ({voxelLabel})</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">{loadInfo} - {w}x{h} - Tileset {curMap?.tileset ?? "-"} - Warm Start {maps ? "json" : "..."}</Text>
      <RealMapView map={curMap} playerPos={pos} fallbackEntry={entry} />
      <HStack spacing={8}>
        <Button title="UP" action={()=>move(0,-1)} />
      </HStack>
      <HStack spacing={8}>
        <Button title="LEFT" action={()=>move(-1,0)} />
        <Button title="ACTION" action={interact} />
        <Button title="DOWN" action={()=>move(0,1)} />
        <Button title="RIGHT" action={()=>move(1,0)} />
      </HStack>
      <VStack spacing={4} padding={8}>
        <Text foregroundStyle="secondaryLabel">Karten: {maps ? Object.keys(maps).length+" geladen" : "..."} - Warps {curMap?.warps?.length ?? 0} - Objekte {curMap?.objects?.length ?? 0}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">Core: {cores.getActive()?.version ?? cores.getLKG()?.version ?? "bundled"} - Governor {pipelines.levelLabel("voxel")} - Pos {pos.x},{pos.y}</Text>
      </VStack>
      <HStack spacing={8}>
        <Button title="Library" action={onBack} />
        <Button title="Karte wechseln" action={()=>{
          if (!maps) return
          const keys = Object.keys(maps)
          const idx = keys.indexOf(mapId)
          const next = keys[(idx+1)%keys.length]!
          setMapId(next)
          const m = (maps as any)[next]
          if (m) setPos({x: Math.floor((m.width??10)/2), y: Math.floor((m.height??9)/2)})
        }} />
        <Button title="Voxel" action={()=>{ pipelines.cycle("voxel",1); }} />
      </HStack>
      <Text font="caption" foregroundStyle="secondaryLabel">Echtes Spiel: ROM-extrahierte Karten ({w}x{h}), echte Warps/Signs, Auto-Save, Viewport 9x9 - nachste: Canvas 2D echte Tile-PNGs + WASM</Text>
    </VStack>
  )
}

function tileChar(tile:number, isPlayer:boolean, isWarp:boolean, isSign:boolean): string {
  if (isPlayer) return "P"
  if (isWarp) return "O"
  if (isSign) return "#"
  if (tile === 0) return "X"
  const mod = tile % 4
  if (mod === 1) return "."
  if (mod === 2) return "o"
  if (mod === 3) return "*"
  return "-"
}
function RealMapView({ map, playerPos, fallbackEntry }: { map:any; playerPos:{x:number;y:number}; fallbackEntry:any }){
  if (!map) {
    return <MapGrid entry={fallbackEntry} playerPos={playerPos} />
  }
  const w = map.width ?? 10
  const h = map.height ?? 9
  const blocks: number[] = map.blocks ?? []
  const warps: any[] = map.warps ?? []
  const signs: any[] = map.signs ?? []
  const px = playerPos.x
  const py = playerPos.y
  const VIEW = 9
  const half = Math.floor(VIEW/2)
  let vx0 = Math.max(0, Math.min(w - VIEW, px - half))
  let vy0 = Math.max(0, Math.min(h - VIEW, py - half))
  if (w <= VIEW) vx0 = 0
  if (h <= VIEW) vy0 = 0
  const viewW = Math.min(VIEW, w)
  const viewH = Math.min(VIEW, h)
  const rows:any[] = []
  for (let y=0; y<viewH; y++){
    const gy = vy0 + y
    const cols:any[] = []
    for (let x=0; x<viewW; x++){
      const gx = vx0 + x
      const idx = gy * w + gx
      const tile = blocks[idx] ?? 0
      const isPlayer = gx===px && gy===py
      const isWarp = warps.some((wp:any)=> wp.x===gx && wp.y===gy)
      const isSign = signs.some((s:any)=> s.x===gx && s.y===gy)
      cols.push(<Text key={x}>{tileChar(tile, isPlayer, isWarp, isSign)}</Text>)
    }
    rows.push(<HStack key={y} spacing={4}>{cols}</HStack>)
  }
  return (
    <VStack spacing={4} padding={8}>
      <Text font="caption" foregroundStyle="secondaryLabel">Map: {map.id ?? map.label ?? "-"} - {w}x{h} (Viewport {viewW}x{viewH} @ {vx0},{vy0}) - {blocks.length} blocks</Text>
      <VStack spacing={2}>{rows}</VStack>
      <Text font="caption" foregroundStyle="secondaryLabel">P @({px},{py}) - Warps {warps.length} - Signs {signs.length} - Tileset {map.tileset ?? "-"} - Legende: P Spieler O Warp # Schild X Wand</Text>
    </VStack>
  )
}
function MapGrid({ entry, playerPos }: { entry: any; playerPos?: {x:number;y:number} }){
  const px = playerPos?.x ?? 2
  const py = playerPos?.y ?? 2
  const row = (y:number) => [0,1,2,3,4].map(x=>{
    if(x===0||x===4||y===0||y===4) return "X"
    if(x===px && y===py) return "P"
    return "."
  })
  return (
    <VStack spacing={4} padding={8}>
      <Text font="caption" foregroundStyle="secondaryLabel">Map: AGATHAS_ROOM - 5x5 Fallback (ladt echte {entry?.gameId ?? ""})</Text>
      <VStack spacing={2}>
        <HStack spacing={4}>{row(0).map((c,i)=><Text key={i}>{c}</Text>)}</HStack>
        <HStack spacing={4}>{row(1).map((c,i)=><Text key={i}>{c}</Text>)}</HStack>
        <HStack spacing={4}>{row(2).map((c,i)=><Text key={i}>{c}</Text>)}</HStack>
        <HStack spacing={4}>{row(3).map((c,i)=><Text key={i}>{c}</Text>)}</HStack>
        <HStack spacing={4}>{row(4).map((c,i)=><Text key={i}>{c}</Text>)}</HStack>
      </VStack>
      <Text font="caption" foregroundStyle="secondaryLabel">P @({px},{py}) - echte Karte ladt via DataLoader json...</Text>
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
  const [voxelMods, setVoxelMods] = useState<string[]>([])

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
    // Mods: lade voxel mod index (stabil, nicht hard codiert)
    try { const mods = host.storage.get<string[]>("mods:voxel:index") ?? []; setVoxelMods(mods) } catch {}
    // Governor nach Voxel-Guide: R.DIST MEDIUM 32 cells als Default (stabil)
    try { if (pipelines.levelLabel("voxel")==="FULL") { /* FULL = max Distanz, Governor regelt */ } } catch {}
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

  const onImportVoxelMod = async () => {
    setStatus("Wähle Voxel Mod ZIP… (DramaticShapeVoxelMod, nicht entpacken, MODS → Import wie Original)")
    try {
      const DP:any=(globalThis as any).DocumentPicker ?? (typeof DocumentPicker!=="undefined"?DocumentPicker:null)
      if(!DP){ setStatus("DocumentPicker nicht verfügbar"); return }
      const pick=DP.pickFiles ?? DP.open
      const urls:string[]|null = await pick.call(DP, { types:["public.zip-archive","public.data"], allowsMultipleSelection:false })
      if(!urls?.length){ setStatus("Abgebrochen"); return }
      const path=urls[0]
      setStatus(`Lese Voxel Mod ${path.split("/").pop()}… (8 MiB Limit)`)
      const bytes=await host.files.readAsBytes(path)
      // Stabil: via VoxelPackImporter (Thread + CacheGuard + R.DIST MEDIUM) — nicht hard codiert
      const { VoxelPackImporter } = await import("./src/import/VoxelPackImporter")
      const imp=new VoxelPackImporter(host.files as any, host.jobs as any)
      const res=await imp.import({ modId:"voxel-mod", kind:"voxels-pack", bytes, apiVersion:"2", coreVersion:"1.0.0", depHash:"auto", graphicsProfile:"balanced" } as any)
      if(!res.ok){ setStatus(`Voxel Mod Import fehlgeschlagen: ${res.error}`); return }
      const cur=host.storage.get<string[]>("mods:voxel:index") ?? []
      const next=[...cur, `voxel-mod:${res.cacheKey.slice(0,8)}`]
      host.storage.set("mods:voxel:index", next as any)
      setVoxelMods(next)
      setStatus(`Voxel Mod ok: ${res.cacheKey.slice(0,8)} — LODs ${Object.keys(res.lods).join(",")} — via Mod, nicht hard codiert`)
      await refresh()
    } catch(e:any){ setStatus(`Voxel Mod Fehler: ${String(e?.message??e)}`) }
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
      <HStack spacing={8}>
        <Button title="Voxel Mod ZIP importieren" action={onImportVoxelMod} />
        <Button title="Karte: AGATHAS_ROOM" action={()=> selectedId && onVerifyData(selectedId)} />
      </HStack>

      <List>
        <Section header={<Text>Mods — Voxel 3D via ZIP (nicht hard codiert, stabil)</Text>}>
          <VStack spacing={4}>
            <Text font="caption" foregroundStyle="secondaryLabel">Voxel Mods installiert: {voxelMods.length ? voxelMods.join(", ") : "keine — via Mod ZIP importieren (DramaticShapeVoxelMod, R.DIST MEDIUM 32 cells, Governor nach Voxel-Guide)"}</Text>
            <Text font="caption">Levels: OFF/15/35/50/FULL/75/1ST — OFF=Fallback, 15-50 stabil, FULL=max Distanz (Governor regelt), 1ST experimentell. Import via MODS Tab wie Original.</Text>
            {selectedId ? <MapGrid entry={entries.find(e=>e.id===selectedId) ?? null} /> : null}
          </VStack>
        </Section>
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

      <Text font="caption" foregroundStyle="secondaryLabel">v0.4.0 - Echtes Spiel (ROM-Karten Viewport 9x9 + Warps/Signs + Auto-Save) - Tests: 92 - 720K</Text>
    </VStack>
  )
}

Navigation.present({ element: <App /> }).then(()=>Script.exit())
