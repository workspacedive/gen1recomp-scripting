/**
 * Scripting iOS — Gen1Recomp Port (Non-Pro, P0 Scaffold)
 * Entry: index.tsx
 *
 * Dieser Scaffold demonstriert:
 * - Game Library (einmaliger Import via DocumentPicker)
 * - Core Store (versioniert)
 * - Host Adapter (FileManager/Storage)
 * - Graceful Degradation wenn WASM/Canvas/Controller fehlen
 *
 * Pro-APIs werden NICHT verwendet.
 * LÖVE2D wird nicht vorausgesetzt — Renderer ist Canvas (Scripting).
 */

import { VStack, HStack, Text, Button, List, Section, Navigation, Script, useState, useEffect } from "scripting"
import { createScriptingHost } from "./src/host/ScriptingAdapter"
import { GameLibrary, type LibraryEntry } from "./src/library/GameLibrary"
import { CoreStore } from "./src/coreStore/CoreStore"

const host = createScriptingHost()
const library = new GameLibrary(host.files, host.storage)
const cores = new CoreStore(host.files, host.storage)

function App() {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [status, setStatus] = useState<string>("Bereit — ROM einmal importieren, danach Warm Start")
  const [coreInfo, setCoreInfo] = useState<string>("Core: —")

  const refresh = async () => {
    const list = await library.list()
    setEntries(list)
    const active = cores.getActive()
    setCoreInfo(active ? `Core: ${active.version} (${active.retention}) — ${active.hash.slice(0,8)}` : "Core: keiner aktiv (Bundled nutzen)")
  }

  useEffect(() => { refresh() }, [])

  const onImport = async () => {
    setStatus("Wähle ROM… (Nur US Red/Blue/Yellow/Gold/Silver/Crystal/FireRed/LeafGreen, SHA-1 geprüft)")
    try {
      // @ts-ignore DocumentPicker global in Scripting
      const urls: string[] = await DocumentPicker.open(["public.data", "public.item"])
      if (!urls?.length) { setStatus("Abgebrochen"); return }
      const path = urls[0]
      setStatus(`Lese ${path.split("/").pop()}… (streamed 4 MiB Chunks, 8 MiB Limit)`)
      const bytes = await host.files.readAsBytes(path)
      setStatus(`SHA-1 prüfen… (${bytes.length} Bytes)`)
      const res = await library.importBytes(bytes, path)
      if (!res.ok) {
        setStatus(`Import fehlgeschlagen: ${res.error}`)
        return
      }
      setStatus(`Import ok: ${res.entry.gameId} (${res.entry.contentHash.slice(0,8)}) — Cache Ready`)
      await refresh()
    } catch (e:any) {
      setStatus(`Fehler: ${String(e?.message ?? e)} — Recovery: erneut wählen`)
    }
  }

  const onPlay = async (e: LibraryEntry) => {
    if (!e.isReady) { setStatus("Cache nicht ready — erneut importieren"); return }
    await library.touchPlayed(e.id)
    const core = await cores.resolveForProfile()
    if (!core) {
      // Bundled Core Fallback — in echter Portierung: JS Bundle laden
      setStatus(`Starte ${e.gameId} (bundled core, fengari)… — Two-Stage Loading (Stage1: Map/Player, Stage2: Preload)`)
    } else {
      setStatus(`Starte ${e.gameId} mit Core ${core.version}…`)
    }
    // Hier würde FixedStep + Canvas Renderer starten
    // Für P0: nur Status + WarmStart Cache Touch
    await refresh()
    // Demo: zeige Canvas Placeholder
    // In echter Portierung: Navigation.present({ element: <GameCanvas entry={e} core={core} /> })
  }

  const onInstallCore = async () => {
    // Demo: installiere Dummy Core v1.0.0
    const dummy = new Uint8Array([0,1,2,3])
    const hash = await crypto.subtle.digest("SHA-256", dummy as unknown as ArrayBuffer).then(d=>Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join(""))
    const rec = {
      version: "1.0.0",
      hash,
      manifest: { apiVersion: "2", compat: ["red","blue","yellow"] },
      source: "manual" as const,
      buildInfo: { commit: "2ea74fa", toolchain: "ts+fengari", luaVersion: "5.3", artifactHash: hash },
      installedAt: Date.now(),
      lastVerifiedAt: Date.now(),
      retention: "active" as const,
      compatibleGames: ["red","blue","yellow"],
    }
    const r = await cores.install(rec, dummy)
    if (!r.ok) setStatus(`Core install fehlgeschlagen: ${(r as any).error}`)
    else { cores.activate("1.0.0"); cores.markVerified("1.0.0"); setStatus("Core 1.0.0 installiert & aktiv (staged→verified)") }
    await refresh()
  }

  return (
    <VStack spacing={12} padding={16}>
      <Text font="title">gen1recomp — Scripting</Text>
      <Text font="caption" color="secondary">{status}</Text>
      <Text font="caption" color="secondary">{coreInfo}</Text>

      <HStack spacing={8}>
        <Button title="ROM importieren" action={onImport} />
        <Button title="Core 1.0.0 installieren (Demo)" action={onInstallCore} />
        <Button title="Aktualisieren" action={refresh} />
      </HStack>

      <List>
        <Section header="Library — einmal importieren, danach Warm Start">
          {entries.length === 0 ? (
            <Text color="secondary">Keine Spiele — DocumentPicker nutzen</Text>
          ) : entries.map(e => (
            <HStack key={e.id}>
              <VStack>
                <Text>{e.gameId.toUpperCase()} ({e.format}) — {e.region}</Text>
                <Text font="caption" color="secondary">{e.contentHash.slice(0,12)}… • {e.isReady ? "Ready" : "Nicht ready"} • {new Date(e.importDate).toLocaleDateString()}</Text>
              </VStack>
              <Button title={e.isReady ? "Spielen" : "Re-Import"} action={()=>onPlay(e)} />
            </HStack>
          ))}
        </Section>
        <Section header="Hinweise (Non-Pro, Offline-First)">
          <Text font="caption">• ROM wird nach Import nicht erneut verlangt (LibraryEntry.isReady via rom-cache.complete)</Text>
          <Text font="caption">• Core Store: staged→verify→activate→monitoring→verified, Rollback zu LKG bei Fehler</Text>
          <Text font="caption">• Saves: atomic (tmp→verify→copy), Backup vor Migration, Journal</Text>
          <Text font="caption">• Grafik: Canvas (2D) primär, kein WebGL/Metal angenommen — Graceful Degradation</Text>
          <Text font="caption">• Lua: fengari (JS) primär, lua.wasm nur in WebView experimentell (NICHT VERIFIZIERT)</Text>
          <Text font="caption">• Falls etwas fehlt: nicht crashen — Fallback + Diagnose</Text>
        </Section>
      </List>

      <Text font="caption2" color="secondary">Docs: docs/ARCHITEKTUR.md • Skills: SKILLS.md • Agents: AGENT.md</Text>
    </VStack>
  )
}

// Scripting Entry — Navigation.present + Script.exit gegen Memory Leak
Navigation.present({ element: <App /> }).then(()=>Script.exit())
