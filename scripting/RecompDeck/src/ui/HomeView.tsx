// Launcher home screen (replaces gen1recomp's proprietary launcher, which is
// never used by RecompDeck). Shows the mandatory credit line prominently.
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Button, HStack, Image, List, Navigation, NavigationLink, NavigationStack, ProgressView, Section,
  Spacer, Text, useEffect, useState, VStack,
} from 'scripting'
import { APP_NAME, CREDIT_LINE, GameId, GameInfo, GAMES } from '../core/constants'
import { strings } from '../core/i18n'
import type { LaunchRequest } from '../core/launch'
import { model, useModel } from '../app/model'
import { slotsFor, SlotInfo } from '../data/saveStore'
import { AboutView } from './AboutView'
import { DiagnosticsView } from './DiagnosticsView'
import { ModsView } from './ModsView'
import { PlayerView } from './PlayerView'
import { SavesView } from './SavesView'
import { SettingsView } from './SettingsView'

export async function startGame(game: GameId, slot?: string) {
  await model.play(game, slot, (session) =>
    Navigation.present({ element: <PlayerView session={session} lang={model.state.lang} />, modalPresentationStyle: 'fullScreen' }))
}

function statusOf(g: GameInfo): { text: string; color: 'systemGreen' | 'systemOrange' | 'secondaryLabel' | 'systemBlue' } {
  const s = model.state
  const t = model.t
  if (!g.supported) return { text: t.notSupported, color: 'secondaryLabel' }
  const cache = s.caches[g.id]
  if (cache && s.game && cache.gameVersion === s.game.version) return { text: t.cacheReady, color: 'systemGreen' }
  if (s.roms[g.id]) return { text: t.romReady, color: 'systemBlue' }
  return { text: t.romMissing, color: 'systemOrange' }
}

function SlotRow({ game, slot }: { game: GameId; slot: SlotInfo }) {
  const s = slot.summary
  const title = s?.name ? s.name : slot.id
  const detail = s ? `🏅 ${s.badges} · Pokédex ${s.dexCount} · ⏱ ${s.timeText}` : slot.path
  return (
    <Button action={() => void startGame(game, slot.id === 'legacy' ? undefined : slot.id)}>
      <HStack>
        <VStack alignment="leading" spacing={2}>
          <Text font="headline">{title}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel">{`${slot.id} · ${detail}`}</Text>
        </VStack>
        <Spacer />
        <Image systemName="play.circle.fill" font={22} foregroundStyle="accentColor" />
      </HStack>
    </Button>
  )
}

export function GameView({ game }: { game: GameInfo }) {
  const state = useModel()
  const t = strings(state.lang)
  const [slots, setSlots] = useState<SlotInfo[]>([])
  useEffect(() => { void slotsFor(game.id).then(setSlots) }, [state.lastSession, state.caches])
  const rom = state.roms[game.id]
  const cache = state.caches[game.id]
  const st = statusOf(game)
  return (
    <List navigationTitle={game.title}>
      <Section>
        <HStack>
          <Image systemName="gamecontroller.fill" foregroundStyle={game.color} font={28} />
          <VStack alignment="leading">
            <Text font="headline">{`Pokémon ${game.title}`}</Text>
            <Text font="caption" foregroundStyle={st.color}>{st.text}</Text>
          </VStack>
        </HStack>
        {game.supported
          ? <Button title={cache ? t.continue : rom ? t.play : t.importRom} systemImage={cache || rom ? 'play.fill' : 'square.and.arrow.down'}
            action={() => void (cache || rom ? startGame(game.id) : model.importRom())} />
          : null}
      </Section>
      {slots.length
        ? <Section title={state.lang === 'de' ? 'Spielstände' : 'Save slots'}>
          {slots.map((s) => <SlotRow game={game.id} slot={s} />)}
        </Section>
        : null}
      <Section header={<Text>ROM</Text>} footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {state.lang === 'de'
          ? 'Nur unveränderte Original-Dumps (SHA-1 geprüft). Die ROM verlässt dein Gerät nie.'
          : 'Only unmodified original dumps (SHA-1 verified). The ROM never leaves your device.'}
      </Text>}>
        {rom
          ? <Text font="footnote">{`${rom.game} · rev ${rom.revision} · SHA-1 ${rom.sha1.slice(0, 12)}…`}</Text>
          : <Text font="footnote" foregroundStyle="secondaryLabel">{t.romMissing}</Text>}
        <Button title={t.importRom} systemImage="doc.badge.plus" action={() => void model.importRom()} />
        {cache
          ? <Button title={state.lang === 'de' ? 'Import neu erstellen' : 'Rebuild import'} systemImage="arrow.clockwise"
            action={() => void model.resetCache(game.id)} />
          : null}
        {rom ? <Button title={t.remove} role="destructive" action={() => void model.removeRom(game.id)} /> : null}
      </Section>
    </List>
  )
}

export function ReleasesView() {
  const state = useModel()
  const t = strings(state.lang)
  useEffect(() => { if (!state.releases) void model.checkReleases() }, [])
  return (
    <List navigationTitle={t.gameFiles}>
      <Section footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {state.lang === 'de'
          ? 'Downloads kommen ausschließlich von den offiziellen GitHub-Releases und werden gegen deren sha256sums.txt geprüft.'
          : 'Downloads come only from the official GitHub releases and are verified against their sha256sums.txt.'}
      </Text>}>
        {(state.releases ?? []).filter((r) => r.loveAsset).slice(0, 10).map((r) => (
          <HStack>
            <VStack alignment="leading" spacing={2}>
              <Text font="headline">{`v${r.version}${r.prerelease ? ' (pre)' : ''}`}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">
                {`${r.publishedAt.slice(0, 10)} · ${(r.loveSize / 1048576).toFixed(1)} MB${r.tested ? ' · ✓ tested' : ''}`}
              </Text>
            </VStack>
            <Spacer />
            {state.game?.version === r.version
              ? <Text font="caption" foregroundStyle="systemGreen">{t.installed}</Text>
              : <Button title={t.install} buttonStyle="bordered" action={() => void model.installRelease(r.version)} />}
          </HStack>
        ))}
        {state.releases === null ? <ProgressView title={t.checking} /> : null}
      </Section>
      <Section>
        <Button title={state.lang === 'de' ? '.love-Datei importieren…' : 'Import .love file…'} systemImage="doc"
          action={() => void model.importLove()} />
      </Section>
    </List>
  )
}

function SetupSection() {
  const state = useModel()
  const t = strings(state.lang)
  const rt = state.runtime
  return (
    <Section header={<Text>{t.setup}</Text>} footer={<Text font="caption2" foregroundStyle="secondaryLabel">{t.firstRunHint}</Text>}>
      <HStack>
        <Image systemName={rt?.installed ? 'checkmark.circle.fill' : 'circle'} foregroundStyle={rt?.installed ? 'systemGreen' : 'secondaryLabel'} />
        <Text>{t.runtime}</Text>
        <Spacer />
        {rt?.installed ? null : <Button title={t.install} buttonStyle="borderedProminent" action={() => void model.installRuntime()} />}
      </HStack>
      <NavigationLink destination={<ReleasesView />}>
        <HStack>
          <Image systemName={state.game ? 'checkmark.circle.fill' : 'circle'} foregroundStyle={state.game ? 'systemGreen' : 'secondaryLabel'} />
          <Text>{t.gameFiles}</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">{state.game ? `v${state.game.version}` : t.notInstalled}</Text>
        </HStack>
      </NavigationLink>
    </Section>
  )
}

export function HomeView({ deepLink }: { deepLink?: LaunchRequest | null }) {
  const state = useModel()
  const t = strings(state.lang)
  const dismiss = Navigation.useDismiss()
  useEffect(() => {
    if (deepLink?.game) void startGame(deepLink.game, deepLink.slot)
  }, [])
  const ready = !!state.runtime?.installed && !!state.game
  return (
    <NavigationStack>
      <List
        navigationTitle={APP_NAME}
        toolbar={{ cancellationAction: <Button title={t.close} action={() => dismiss()} /> }}
      >
        <Section footer={<Text font="caption2" foregroundStyle="secondaryLabel">{CREDIT_LINE}</Text>}>
          <VStack alignment="leading" spacing={4}>
            <Text font="title2" fontWeight="bold">{APP_NAME}</Text>
            <Text font="subheadline" foregroundStyle="secondaryLabel">{t.appSubtitle}</Text>
          </VStack>
          {state.busy ? <ProgressView title={state.busy} /> : null}
          {state.updateAvailable
            ? <NavigationLink destination={<ReleasesView />}>
              <Label2 icon="arrow.down.circle.fill" color="systemBlue" text={`${t.update}: v${state.updateAvailable.version}`} />
            </NavigationLink>
            : null}
        </Section>
        {ready ? null : <SetupSection />}
        <Section title={t.games}>
          {GAMES.map((g) => {
            const st = statusOf(g)
            return (
              <NavigationLink destination={<GameView game={g} />}>
                <HStack>
                  <Image systemName="gamecontroller.fill" foregroundStyle={g.supported ? g.color : 'systemGray3'} />
                  <VStack alignment="leading" spacing={2}>
                    <Text foregroundStyle={g.supported ? 'label' : 'secondaryLabel'}>{g.title}</Text>
                    <Text font="caption" foregroundStyle={st.color} lineLimit={1}>{st.text}</Text>
                  </VStack>
                </HStack>
              </NavigationLink>
            )
          })}
        </Section>
        <Section>
          <Button title={t.importRom} systemImage="doc.badge.plus" action={() => void model.importRom()} />
          <NavigationLink destination={<ModsView />}>
            <Label2 icon="puzzlepiece.extension.fill" color="systemPurple" text={`${t.mods} (${state.mods.filter((m) => m.enabled).length}/${state.mods.length})`} />
          </NavigationLink>
          <NavigationLink destination={<SavesView />}>
            <Label2 icon="externaldrive.fill" color="systemTeal" text={t.saves} />
          </NavigationLink>
          <NavigationLink destination={<SettingsView />}>
            <Label2 icon="gearshape.fill" color="systemGray" text={t.settings} />
          </NavigationLink>
          {ready
            ? <NavigationLink destination={<ReleasesView />}>
              <Label2 icon="shippingbox.fill" color="systemBrown" text={`${t.gameFiles} (v${state.game?.version})`} />
            </NavigationLink>
            : null}
          <NavigationLink destination={<DiagnosticsView />}>
            <Label2 icon="stethoscope" color="systemRed" text={t.diagnostics} />
          </NavigationLink>
          <NavigationLink destination={<AboutView />}>
            <Label2 icon="info.circle.fill" color="systemBlue" text={t.about} />
          </NavigationLink>
        </Section>
      </List>
    </NavigationStack>
  )
}

function Label2({ icon, color, text }: { icon: string; color: 'systemBlue' | 'systemPurple' | 'systemTeal' | 'systemGray' | 'systemBrown' | 'systemRed'; text: string }) {
  return (
    <HStack>
      <Image systemName={icon} foregroundStyle={color} />
      <Text>{text}</Text>
    </HStack>
  )
}
