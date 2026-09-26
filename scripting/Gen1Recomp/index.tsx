import {
  Button, DocumentPicker, HStack, Image, Label, List, Navigation, NavigationStack,
  Script, Section, Spacer, Text, VStack, useEffect, useState
} from 'scripting'
import { APP, THEME } from './config'
import { bootstrap, importContent, libraryRows, ROOT, type LibraryRow } from './host'
import { runCapabilityProbe, type ProbeReport } from './capability-probe'
import { evaluateRuntimeGate } from './runtime-gate'
import { t, type Locale } from './i18n'

const locale: Locale = APP.defaultLocale

function GameRow({ row }: { row: LibraryRow }) {
  const known = row.game !== 'unknown'
  const color = THEME.game[row.game]
  return <VStack alignment="leading" spacing={6} padding={{ vertical: 8 }}>
    <HStack spacing={12}>
      <Image systemName="rectangle.portrait.fill" foregroundStyle={color} />
      <VStack alignment="leading" spacing={2}>
        <Text font="headline">{row.displayName}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">
          {known ? `${row.game.toUpperCase()} · ${row.region} · ${row.language.toUpperCase()}` : row.sourceName}
        </Text>
      </VStack>
      <Spacer />
      <Text font="caption" foregroundStyle={known ? THEME.yellow : THEME.red}>
        {known ? t(locale, 'known') : t(locale, 'unsupported')}
      </Text>
    </HStack>
    <Text font="caption2" foregroundStyle="secondaryLabel">
      SHA-256 {row.sha256.slice(0, 12)}… · {Math.round(row.byteLength / 1024)} KB · {t(locale, 'unknown')}
    </Text>
  </VStack>
}

function ProbeSummary({ probe }: { probe: ProbeReport }) {
  const gate = evaluateRuntimeGate(probe)
  return <VStack alignment="leading" spacing={5} padding={{ vertical: 6 }}>
    <Text font="headline" foregroundStyle={THEME.red}>{t(locale, gate.status === 'candidate' ? 'gateCandidate' : 'gateBlocked')}</Text>
    <Text font="caption" foregroundStyle="secondaryLabel">
      WASM {probe.wasm.instantiates ? '✓' : '✗'} · WebGL {probe.graphics.clearReadback ? '✓' : '✗'} · Audio {probe.audio.contextConstructed ? '✓' : '✗'}
    </Text>
    <Text font="caption" foregroundStyle="secondaryLabel">
      Local JS {probe.runtime.localScriptSubresource ? '✓' : '✗'} · Worker {probe.workers.dedicatedApiPresent ? '✓' : '✗'} · IndexedDB API {probe.storage.indexedDbApiPresent ? '✓' : '✗'}
    </Text>
    <Text font="caption2" foregroundStyle="secondaryLabel">{t(locale, 'probeOnly')}</Text>
    <Text font="caption2" foregroundStyle="secondaryLabel">{gate.reasons.join(' · ')}</Text>
  </VStack>
}

function App() {
  const dismiss = Navigation.useDismiss()
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [probe, setProbe] = useState<ProbeReport | null>(null)
  const [message, setMessage] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    await bootstrap()
    setRows(await libraryRows())
  }

  useEffect(() => { reload().catch(error => setMessage(String(error))) }, [])

  const chooseRom = async () => {
    if (busy) return
    setBusy(true)
    setMessage(t(locale, 'importing'))
    try {
      const selected = await DocumentPicker.pickFiles({ types: ['public.data'] })
      const source = selected[0]
      if (!source) { setMessage(''); return }
      const row = await importContent(source)
      setMessage(`${t(locale, 'imported')}: ${row.displayName}`)
      await reload()
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }

  const probeRuntime = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await runCapabilityProbe()
      setProbe(result)
      setMessage(t(locale, 'probeOnly'))
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }

  const gate = evaluateRuntimeGate(probe)
  return <NavigationStack>
    <List
      navigationTitle="GEN1RECOMP++"
      toolbar={{ topBarTrailing: [<Button title={t(locale, 'close')} action={dismiss} />] }}
      refreshable={reload}
    >
      <Section header={<Text foregroundStyle={THEME.red} fontWeight="bold">{t(locale, 'library')}</Text>}>
        {rows.length === 0 ? <VStack alignment="leading" spacing={4} padding={{ vertical: 12 }}>
          <Text font="headline">{t(locale, 'empty')}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel">Red · Blue · Yellow</Text>
        </VStack> : rows.map(row => <GameRow key={row.id} row={row} />)}
        <Button title={busy ? t(locale, 'importing') : t(locale, 'import')} systemImage="square.and.arrow.down" action={chooseRom} />
      </Section>

      <Section header={<Text foregroundStyle={THEME.blue} fontWeight="bold">{t(locale, 'diagnostics')}</Text>}>
        <Button title={t(locale, 'capabilities')} systemImage="stethoscope" action={probeRuntime} />
        {probe ? <ProbeSummary probe={probe} /> : <VStack alignment="leading" spacing={4} padding={{ vertical: 6 }}>
          <Text font="headline" foregroundStyle={THEME.yellow}>{t(locale, 'gateProbe')}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel">{gate.reasons.join(' · ')}</Text>
        </VStack>}
        <Text font="caption">{t(locale, 'note')}</Text>
        {message ? <Text font="caption" foregroundStyle="secondaryLabel">{message}</Text> : null}
      </Section>

      <Section header={<Text foregroundStyle={THEME.yellow} fontWeight="bold">{t(locale, 'settings')}</Text>}>
        <Label title={t(locale, 'free')} systemImage="checkmark.shield.fill" />
        <VStack alignment="leading" spacing={3}>
          <Text>{t(locale, 'files')}</Text>
          <Text font="caption2" foregroundStyle="secondaryLabel">{ROOT}</Text>
        </VStack>
        <Text font="caption" foregroundStyle="secondaryLabel">{t(locale, 'criticalStorage')}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">{t(locale, 'recovery')}</Text>
      </Section>
    </List>
  </NavigationStack>
}

async function main() {
  await Navigation.present({ element: <App />, modalPresentationStyle: 'fullScreen' })
  Script.exit()
}
main()
