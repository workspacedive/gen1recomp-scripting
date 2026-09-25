// Full-screen player: the game WebView plus a small native menu button. The
// menu pauses the game (simulation + main loop + audio) while it is open.
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Button, HStack, Image, List, Navigation, NavigationStack, Picker, Section, Spacer, Text,
  useEffect, useState, VStack, WebView, ZStack,
} from 'scripting'
import { strings, Lang } from '../core/i18n'
import type { FpsCap } from '../core/settings'
import type { PlayerSession, SessionEvent } from '../player/session'
import { model } from '../app/model'

interface Props {
  session: PlayerSession
  lang: Lang
}

function PlayerMenu({ session, lang, onResume, onExit }: Props & { onResume: () => void; onExit: () => void }) {
  const t = strings(lang)
  const [fps, setFps] = useState<number>(model.state.settings.fpsCap)
  const [stats, setStats] = useState<string>('')
  useEffect(() => {
    void session.requestStats().then((v) => {
      if (v && typeof v === 'object') {
        const s = v as Record<string, unknown>
        setStats(`${s.fps ?? '?'} fps · ${s.frameMs ?? '?'} ms/frame`)
      }
    })
  }, [])
  return (
    <NavigationStack>
      <List navigationTitle={t.menu} navigationBarTitleDisplayMode="inline"
        toolbar={{ confirmationAction: <Button title={t.resume} action={onResume} /> }}>
        <Section>
          <Button title={t.resume} systemImage="play.fill" action={onResume} />
        </Section>
        <Section title={t.graphics}>
          <Picker title={t.fpsCap} value={fps} onChanged={(v: number) => {
            setFps(v)
            model.updateSettings({ fpsCap: v as FpsCap })
            void session.setFpsCap(v)
          }}>
            <Text tag={30}>30 fps</Text>
            <Text tag={60}>60 fps</Text>
            <Text tag={120}>120 fps (ProMotion)</Text>
            <Text tag={0}>Display</Text>
          </Picker>
          {stats ? <Text font="footnote" foregroundStyle="secondaryLabel">{stats}</Text> : null}
        </Section>
        <Section footer={<Text font="footnote" foregroundStyle="secondaryLabel">
          {lang === 'de'
            ? 'Fortschritt seit dem letzten Speichern im Spiel geht verloren.'
            : 'Progress since your last in-game save will be lost.'}
        </Text>}>
          <Button title={t.exitGame} systemImage="xmark.circle" role="destructive" action={onExit} />
        </Section>
      </List>
    </NavigationStack>
  )
}

export function PlayerView({ session, lang }: Props) {
  const dismiss = Navigation.useDismiss()
  const t = strings(lang)
  const [menuOpen, setMenuOpen] = useState(false)
  const [fault, setFault] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    session.setListener((e: SessionEvent) => {
      if (e.kind === 'quit') dismiss()
      else if (e.kind === 'engineFault') setFault({ title: t.engineFault, message: e.message })
      else if (e.kind === 'error' && e.details) setFault({ title: t.error, message: e.message })
    })
    return () => session.setListener(null)
  }, [])

  const openMenu = () => {
    void session.pause()
    setMenuOpen(true)
  }
  const onMenuChanged = (open: boolean) => {
    setMenuOpen(open)
    if (!open) void session.resume()
  }

  return (
    <ZStack
      alignment="topTrailing"
      background="black"
      ignoresSafeArea={true}
      statusBarHidden={true}
      persistentSystemOverlays="hidden"
      sheet={{
        isPresented: menuOpen,
        onChanged: onMenuChanged,
        content: <PlayerMenu
          session={session}
          lang={lang}
          onResume={() => onMenuChanged(false)}
          onExit={() => { setMenuOpen(false); dismiss() }}
        />,
      }}
    >
      <WebView controller={session.controller} ignoresSafeArea={true} />
      {fault
        ? <VStack spacing={10} padding={16} background="rgba(20,20,24,0.92)" frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
          <Spacer />
          <Image systemName="exclamationmark.triangle.fill" font={40} foregroundStyle="systemYellow" />
          <Text font="headline" foregroundStyle="white" multilineTextAlignment="center">{fault.title}</Text>
          <Text font="footnote" foregroundStyle="lightGray" multilineTextAlignment="center" textSelection={true}>{fault.message}</Text>
          <Button title={t.close} buttonStyle="borderedProminent" action={() => dismiss()} />
          <Spacer />
        </VStack>
        : <HStack padding={{ top: 6, trailing: 6 }}>
          <Button action={openMenu} buttonStyle="plain">
            <Image systemName="ellipsis.circle.fill" font={24} foregroundStyle="rgba(255,255,255,0.45)" padding={6} />
          </Button>
        </HStack>}
    </ZStack>
  )
}
