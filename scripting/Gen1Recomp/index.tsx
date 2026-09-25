import {
  Button, DocumentPicker, HStack, Image, Label, List, Navigation, NavigationStack,
  Script, Section, Spacer, Text, VStack, useEffect, useState
} from 'scripting'
import { bootstrap, importContent, libraryRows, ROOT, type LibraryRow } from './host'
import { runCapabilityProbe, type ProbeReport } from './capability-probe'
import { t, type Locale } from './i18n'

const locale: Locale = 'de'
const gameColors = ['#c13034', '#2864a8', '#d6a313']

function GameRow({ row, index }: { row: LibraryRow; index: number }) {
  return <VStack alignment="leading" spacing={6} padding={{ vertical: 8 }}>
    <HStack spacing={12}>
      <Image systemName="rectangle.portrait.fill" foregroundStyle={gameColors[index % gameColors.length]} />
      <VStack alignment="leading" spacing={2}>
        <Text font="headline">{row.displayName}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">{row.sha256.slice(0, 12)} · {Math.round(row.byteLength / 1024)} KB</Text>
      </VStack>
      <Spacer />
      <Text font="caption" foregroundStyle={row.status === 'unsupported-content' ? '#c13034' : '#d6a313'}>
        {row.status === 'unsupported-content' ? t(locale, 'unsupported') : t(locale, 'unknown')}
      </Text>
    </HStack>
    <Text font="caption2" foregroundStyle="secondaryLabel">{t(locale, 'note')}</Text>
  </VStack>
}

function App() {
  const dismiss = Navigation.useDismiss()
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [probe, setProbe] = useState<ProbeReport | null>(null)
  const [message, setMessage] = useState<string>('')

  const reload = async () => {
    await bootstrap()
    setRows(await libraryRows())
  }

  useEffect(() => { reload().catch(error => setMessage(String(error))) }, [])

  const chooseRom = async () => {
    try {
      const selected = await DocumentPicker.pickFiles({ types: ['public.data'] })
      const source = selected[0]
      if (!source) return
      const row = await importContent(source)
      setMessage(`${t(locale, 'imported')}: ${row.displayName}`)
      await reload()
    } catch (error) { setMessage(String(error)) }
  }

  const probeRuntime = async () => {
    try {
      const result = await runCapabilityProbe()
      setProbe(result)
      setMessage(`WASM ${result.wasm.basic ? '✓' : '✗'} · WebGL ${result.graphics.webgl2 || result.graphics.webgl1 ? '✓' : '✗'} · Audio API ${result.audio.webAudioApiPresent ? '✓' : '✗'}`)
    } catch (error) { setMessage(String(error)) }
  }

  return <NavigationStack>
    <List
      navigationTitle="GEN1RECOMP++"
      toolbar={{ topBarTrailing: [<Button title={t(locale, 'close')} action={dismiss} />] }}
      refreshable={reload}
    >
      <Section header={<Text foregroundStyle="#c13034" fontWeight="bold">{t(locale, 'library')}</Text>}>
        {rows.length === 0 ? <VStack alignment="leading" spacing={4} padding={{ vertical: 12 }}>
          <Text font="headline">{t(locale, 'empty')}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel">Red · Blue · Yellow</Text>
        </VStack> : rows.map((row, index) => <GameRow key={row.id} row={row} index={index} />)}
        <Button title={t(locale, 'import')} systemImage="square.and.arrow.down" action={chooseRom} />
      </Section>

      <Section header={<Text foregroundStyle="#2864a8" fontWeight="bold">{t(locale, 'diagnostics')}</Text>}>
        <Button title={t(locale, 'capabilities')} systemImage="stethoscope" action={probeRuntime} />
        {probe ? <Text font="caption" foregroundStyle="secondaryLabel">WASM {probe.wasm.basic ? '✓' : '✗'} · WebGL {probe.graphics.webgl2 || probe.graphics.webgl1 ? '✓' : '✗'} · Worker {probe.workers.dedicatedApiPresent ? '✓' : '✗'}</Text> : null}
        {message ? <Text font="caption">{message}</Text> : null}
      </Section>

      <Section header={<Text foregroundStyle="#d6a313" fontWeight="bold">{t(locale, 'settings')}</Text>}>
        <Label title={t(locale, 'free')} systemImage="checkmark.shield.fill" />
        <VStack alignment="leading" spacing={3}>
          <Text>{t(locale, 'files')}</Text>
          <Text font="caption2" foregroundStyle="secondaryLabel">{ROOT}</Text>
        </VStack>
      </Section>
    </List>
  </NavigationStack>
}

async function main() {
  await Navigation.present({ element: <App />, modalPresentationStyle: 'fullScreen' })
  Script.exit()
}
main()
