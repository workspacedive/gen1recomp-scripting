import {
  Button, Label, List, Navigation, NavigationStack, ProgressView,
  Script, Section, TabView, Text, VStack, useEffect, useState,
} from "scripting"
import { APP } from "./config"
import { runCapabilityProbe } from "./capability-probe"
import { evaluateRuntimeGate } from "./runtime-gate"
import { bootstrap, importContent, libraryRows, ROOT, type LibraryRow } from "./host"
import {
  COMPONENTS, checkUpstreamRelease, loadCachedReleaseStatus, type UpstreamReleaseStatus,
} from "./component-catalog"
import {
  importModZip, listInstalledMods, recoverPendingModImport, removeInstalledMod,
  type InstalledMod,
} from "./mod-store"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function GamesView(props: {
  tag?: number
  tabItem?: any
  rows: LibraryRow[]
  busy: boolean
  notice: string
  refresh: () => Promise<void>
  importGame: () => Promise<void>
}) {
  return <NavigationStack tag={props.tag} tabItem={props.tabItem}>
    <List navigationTitle="Spiele" navigationBarTitleDisplayMode="large">
      <Section header={<Text>Bibliothek</Text>} footer={<Text>
        Originaldateien bleiben dauerhaft nach SHA-256 getrennt in „Auf meinem iPhone/Gen1Recomp“.
      </Text>}>
        {props.rows.length === 0
          ? <VStack spacing={8}><Text>Noch kein Spiel importiert.</Text><Text>Der Import ist dauerhaft und offline nutzbar.</Text></VStack>
          : props.rows.map((row) => <VStack key={row.sha256} alignment="leading" spacing={4}>
              <Text>{row.displayName}</Text>
              <Text>{`${row.game} · ${row.region} · ${row.language}`}</Text>
              <Text>{`${row.byteLength} Bytes · ${row.status}`}</Text>
            </VStack>)}
      </Section>
      <Section header={<Text>Aktionen</Text>}>
        <Button title="Spieldatei importieren" systemImage="square.and.arrow.down" disabled={props.busy} action={props.importGame} />
        <Button title="Bibliothek aktualisieren" systemImage="arrow.clockwise" disabled={props.busy} action={props.refresh} />
        {props.busy ? <ProgressView /> : null}
        {props.notice ? <Text>{props.notice}</Text> : null}
      </Section>
      <Section header={<Text>Laufzeitstatus</Text>} footer={<Text>
        Start bleibt gesperrt, bis love.js, lokale WASM-Ressourcen, Grafik, Audio, Persistenz und Wiederherstellung auf einem echten Gerät bestanden haben.
      </Text>}>
        <Text>{APP.runtimeEnabled ? "Laufzeit freigegeben" : "Laufzeit absichtlich deaktiviert"}</Text>
      </Section>
    </List>
  </NavigationStack>
}

function ModsView(props: {
  tag?: number
  tabItem?: any
  mods: InstalledMod[]
  busy: boolean
  notice: string
  refresh: () => Promise<void>
  importMod: () => Promise<void>
  removeMod: (mod: InstalledMod) => Promise<void>
}) {
  return <NavigationStack tag={props.tag} tabItem={props.tabItem}>
    <List navigationTitle="Mods" navigationBarTitleDisplayMode="large">
      <Section header={<Text>Lokale Pakete</Text>} footer={<Text>
        Pakete werden vor dem Entpacken auf Pfade, Symlinks, Kompression und Größen geprüft. Aktivierung folgt erst mit der verifizierten Spiellaufzeit.
      </Text>}>
        {props.mods.length === 0 ? <Text>Keine Mod-Pakete gespeichert.</Text> : props.mods.map((mod) =>
          <VStack key={`${mod.id}-${mod.version}-${mod.sha256}`} alignment="leading" spacing={4}>
            <Text>{mod.name}</Text>
            <Text>{`${mod.id} · ${mod.version} · API ${mod.api}`}</Text>
            <Text>{`Sicher gespeichert · noch nicht aktiviert · ${mod.sha256.slice(0, 12)}…`}</Text>
            <Button title="Paket entfernen" systemImage="trash" disabled={props.busy} action={() => props.removeMod(mod)} />
          </VStack>)}
      </Section>
      <Section header={<Text>Installation</Text>}>
        <Button title="Mod-ZIP prüfen und speichern" systemImage="shippingbox.and.arrow.backward" disabled={props.busy} action={props.importMod} />
        <Button title="Liste aktualisieren" systemImage="arrow.clockwise" disabled={props.busy} action={props.refresh} />
        {props.busy ? <ProgressView /> : null}
        {props.notice ? <Text>{props.notice}</Text> : null}
      </Section>
    </List>
  </NavigationStack>
}

function DiagnosticsView(props: {
  tag?: number
  tabItem?: any
  busy: boolean
  summary: string
  details: string[]
  run: () => Promise<void>
}) {
  return <NavigationStack tag={props.tag} tabItem={props.tabItem}>
    <List navigationTitle="Diagnose" navigationBarTitleDisplayMode="large">
      <Section header={<Text>Geräteprüfung</Text>} footer={<Text>
        Der Bericht wird in Documents/Gen1Recomp/Diagnostics/capabilities.v2.json gespeichert.
      </Text>}>
        <Button title="Prüfung ausführen" systemImage="stethoscope" disabled={props.busy} action={props.run} />
        {props.busy ? <ProgressView /> : null}
        <Text>{props.summary || "Noch keine Prüfung in dieser Sitzung."}</Text>
        {props.details.map((detail, index) => <Text key={`${index}-${detail}`}>{detail}</Text>)}
      </Section>
      <Section header={<Text>Interpretation</Text>}>
        <Text>Die Prüfung belegt Host-APIs und lokale Ressourcen. Sie belegt noch keinen love.js-Spielstart.</Text>
      </Section>
    </List>
  </NavigationStack>
}

function SettingsView(props: {
  tag?: number
  tabItem?: any
  busy: boolean
  update: UpstreamReleaseStatus | null
  notice: string
  checkUpdates: () => Promise<void>
}) {
  const updateText = props.update == null ? "Noch nicht geprüft" :
    props.update.state === "current" ? `Aktuell: ${props.update.latestVersion}` :
    props.update.state === "available" ? `Payload ${props.update.latestVersion} ist verfügbar` :
    props.update.state === "metadata-incomplete" ? "Release-Metadaten unvollständig – keine Installation" :
    "Versionsformat nicht sicher vergleichbar"
  return <NavigationStack tag={props.tag} tabItem={props.tabItem}>
    <List navigationTitle="Einstellungen" navigationBarTitleDisplayMode="large">
      <Section header={<Text>Komponenten</Text>} footer={<Text>
        Komponenten werden getrennt versioniert. Eine Prüfung lädt nur Metadaten; sie aktiviert oder überschreibt nichts.
      </Text>}>
        <Text>{`Scripting-Projekt ${COMPONENTS.hostProject.version}`}</Text>
        <Text>{`Gen1Recomp Audit-Pin ${COMPONENTS.gen1recomp.version}`}</Text>
        <Text>{`love.js / LÖVE ${COMPONENTS.lovejs.loveVersion}`}</Text>
        <Text>{updateText}</Text>
        <Button title="Gen1Recomp-Release prüfen" systemImage="arrow.triangle.2.circlepath" disabled={props.busy} action={props.checkUpdates} />
        {props.busy ? <ProgressView /> : null}
        {props.notice ? <Text>{props.notice}</Text> : null}
      </Section>
      <Section header={<Text>Update-Sicherheit</Text>}>
        <Text>Download → SHA-256 → Kompatibilitätsgate → Staging → Health-Check → atomare Aktivierung → Rollback.</Text>
        <Text>Netzwerk-Aktivierung bleibt deaktiviert, bis die Laufzeitgates auf einem echten Gerät bestanden sind.</Text>
      </Section>
      <Section header={<Text>Speicher</Text>}>
        <Text>{ROOT}</Text>
        <Text>Spiele, Mods, Saves und Diagnose bleiben getrennt von austauschbaren Core-Komponenten.</Text>
      </Section>
    </List>
  </NavigationStack>
}

function App() {
  const [tabIndex, setTabIndex] = useState(0)
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [mods, setMods] = useState<InstalledMod[]>([])
  const [busy, setBusy] = useState(false)
  const [gameNotice, setGameNotice] = useState("Initialisierung …")
  const [modNotice, setModNotice] = useState("")
  const [diagnosticSummary, setDiagnosticSummary] = useState("")
  const [diagnosticDetails, setDiagnosticDetails] = useState<string[]>([])
  const [update, setUpdate] = useState<UpstreamReleaseStatus | null>(null)
  const [settingsNotice, setSettingsNotice] = useState("")

  async function refreshGames(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await bootstrap()
      setRows(await libraryRows())
      setGameNotice("Bibliothek bereit.")
    } catch (error) { setGameNotice(`Fehler: ${errorMessage(error)}`) }
    finally { setBusy(false) }
  }

  async function refreshMods(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await bootstrap()
      const recovered = await recoverPendingModImport()
      setMods(await listInstalledMods())
      setModNotice(recovered ? "Unterbrochener Mod-Import sicher verworfen." : "Mod-Speicher bereit.")
    } catch (error) { setModNotice(`Fehler: ${errorMessage(error)}`) }
    finally { setBusy(false) }
  }

  async function chooseGame(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const files = await DocumentPicker.pickFiles({ allowsMultipleSelection: false, types: ["public.data"] })
      if (files.length === 0) { setGameNotice("Import abgebrochen."); return }
      const row = await importContent(files[0])
      setRows(await libraryRows())
      setGameNotice(`${row.displayName} wurde sicher importiert.`)
    } catch (error) { setGameNotice(`Import fehlgeschlagen: ${errorMessage(error)}`) }
    finally { DocumentPicker.stopAcessingSecurityScopedResources(); setBusy(false) }
  }

  async function chooseMod(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const files = await DocumentPicker.pickFiles({ allowsMultipleSelection: false, types: ["public.zip-archive"] })
      if (files.length === 0) { setModNotice("Import abgebrochen."); return }
      const mod = await importModZip(files[0])
      setMods(await listInstalledMods())
      setModNotice(`${mod.name} ${mod.version} wurde geprüft und sicher gespeichert.`)
    } catch (error) { setModNotice(`Mod-Import fehlgeschlagen: ${errorMessage(error)}`) }
    finally { DocumentPicker.stopAcessingSecurityScopedResources(); setBusy(false) }
  }

  async function removeMod(mod: InstalledMod): Promise<void> {
    if (busy) return
    const confirmed = await Dialog.confirm({
      title: "Mod-Paket entfernen?", message: `${mod.name} ${mod.version} wird aus dem lokalen Mod-Speicher entfernt.`,
      cancelLabel: "Abbrechen", confirmLabel: "Entfernen",
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await removeInstalledMod(mod)
      setMods(await listInstalledMods())
      setModNotice(`${mod.name} wurde entfernt.`)
    } catch (error) { setModNotice(`Entfernen fehlgeschlagen: ${errorMessage(error)}`) }
    finally { setBusy(false) }
  }

  async function runDiagnostics(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await bootstrap()
      const report = await runCapabilityProbe()
      const gate = evaluateRuntimeGate(report)
      setDiagnosticSummary(gate.status === "candidate" ? "Kandidat – weitere Laufzeittests nötig" : "Laufzeitgate blockiert")
      setDiagnosticDetails([
        `WASM ${report.wasm.instantiates ? "✓" : "✗"} · WebGL ${report.graphics.clearReadback ? "✓" : "✗"} · Audio ${report.audio.contextConstructed ? "✓" : "✗"}`,
        `Lokales JS ${report.runtime.localScriptSubresource ? "✓" : "✗"} · IndexedDB ${report.storage.indexedDbApiPresent ? "✓" : "✗"}`,
        ...gate.reasons,
      ])
    } catch (error) { setDiagnosticSummary(`Diagnose fehlgeschlagen: ${errorMessage(error)}`) }
    finally { setBusy(false) }
  }

  async function checkUpdates(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const result = await checkUpstreamRelease()
      setUpdate(result)
      setSettingsNotice(result.state === "available"
        ? "Nur Metadaten geprüft. Download und Aktivierung bleiben aus Sicherheitsgründen gesperrt."
        : "Release-Metadaten wurden gelesen; es wurde nichts verändert.")
    } catch (error) { setSettingsNotice(`Update-Prüfung fehlgeschlagen: ${errorMessage(error)}`) }
    finally { setBusy(false) }
  }

  // Local state only; network update checks always require an explicit tap.
  useEffect(() => {
    setBusy(true)
    bootstrap().then(async () => {
      setRows(await libraryRows())
      const recovered = await recoverPendingModImport()
      setMods(await listInstalledMods())
      setUpdate(await loadCachedReleaseStatus())
      setGameNotice("Bibliothek bereit.")
      if (recovered) setModNotice("Unterbrochener Mod-Import sicher verworfen.")
    }).catch((error) => setGameNotice(`Initialisierung fehlgeschlagen: ${errorMessage(error)}`))
      .finally(() => setBusy(false))
  }, [])

  return <TabView tabIndex={tabIndex} onTabIndexChanged={setTabIndex}>
    <GamesView tag={0} tabItem={<Label title="Spiele" systemImage="gamecontroller" />}
      rows={rows} busy={busy} notice={gameNotice} refresh={refreshGames} importGame={chooseGame} />
    <ModsView tag={1} tabItem={<Label title="Mods" systemImage="puzzlepiece.extension" />}
      mods={mods} busy={busy} notice={modNotice} refresh={refreshMods} importMod={chooseMod} removeMod={removeMod} />
    <DiagnosticsView tag={2} tabItem={<Label title="Diagnose" systemImage="stethoscope" />}
      busy={busy} summary={diagnosticSummary} details={diagnosticDetails} run={runDiagnostics} />
    <SettingsView tag={3} tabItem={<Label title="Einstellungen" systemImage="gearshape" />}
      busy={busy} update={update} notice={settingsNotice} checkUpdates={checkUpdates} />
  </TabView>
}

async function run(): Promise<void> {
  await Navigation.present({ element: <App /> })
  Script.exit()
}

run()
