// Mod manager: safe import (scan -> review -> install), enable/disable,
// permission disclosure, removal.
// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, HStack, List, Navigation, NavigationStack, Section, Spacer, Text, Toggle, useState, VStack } from 'scripting'
import { strings } from '../core/i18n'
import { UNAVAILABLE_ON_WEB, ModPermission } from '../core/manifest'
import type { ModCandidate } from '../data/modStore'
import { model, useModel } from '../app/model'
import { formatBytes } from '../platform/fs'

const PERMISSION_TEXT: Record<string, { en: string; de: string }> = {
  network: { en: 'Uses the network', de: 'Nutzt das Netzwerk' },
  filesystem: { en: 'Reads/writes files', de: 'Liest/schreibt Dateien' },
  engine_internals: { en: 'Patches engine code', de: 'Verändert Engine-Code' },
  steps: { en: 'Step counter', de: 'Schrittzähler' },
  background: { en: 'Background work', de: 'Hintergrundarbeit' },
  compute: { en: 'Heavy computation', de: 'Rechenintensiv' },
}

function ReviewSheet({ c, onDone }: { c: ModCandidate; onDone: () => void }) {
  const lang = model.state.lang
  const t = strings(lang)
  const dismiss = Navigation.useDismiss()
  const m = c.manifest
  const finish = async (install: boolean, enable: boolean) => {
    if (install) await model.confirmMod(c, enable)
    else await model.rejectMod(c)
    dismiss()
    onDone()
  }
  return (
    <NavigationStack>
      <List navigationTitle={m.name} navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title={t.cancel} action={() => void finish(false, false)} /> }}>
        <Section>
          <Text font="headline">{`${m.name} ${m.version}`}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel">{`id ${m.id} · ${m.category ?? 'OTHER'} · ${m.games.join(', ')}`}</Text>
          {m.author ? <Text font="caption">{m.author}</Text> : null}
          {m.description ? <Text font="footnote">{m.description}</Text> : null}
          <Text font="caption2" foregroundStyle="secondaryLabel">{`${c.fileCount} files · ${formatBytes(c.totalBytes)}`}</Text>
        </Section>
        <Section header={<Text>t.permissions</Text>} footer={<Text font="caption2" foregroundStyle="secondaryLabel">
          {lang === 'de'
            ? 'Mods laufen in der Sandbox des Spiels. Berechtigungen werden vom Spiel durchgesetzt; RecompDeck zeigt sie vor der Installation an.'
            : 'Mods run inside the game\'s sandbox. Permissions are enforced by the game; RecompDeck shows them before installing.'}
        </Text>}>
          {m.permissions.length === 0 ? <Text>{lang === 'de' ? 'Keine' : 'None'}</Text> : null}
          {m.permissions.map((p) => {
            const note = UNAVAILABLE_ON_WEB[p as ModPermission] ?? null
            return (
              <VStack alignment="leading" spacing={2}>
                <Text foregroundStyle="systemOrange">{`⚠︎ ${PERMISSION_TEXT[p]?.[lang] ?? p}`}</Text>
                {note ? <Text font="caption2" foregroundStyle="secondaryLabel">{note}</Text> : null}
              </VStack>
            )
          })}
        </Section>
        {c.warnings.length ? <Section title="Warnings">{c.warnings.map((w) => <Text font="caption">{w}</Text>)}</Section> : null}
        {c.replaces ? <Section><Text font="footnote">{`${lang === 'de' ? 'Ersetzt' : 'Replaces'} ${c.replaces.name} ${c.replaces.version}`}</Text></Section> : null}
        <Section>
          <Button title={lang === 'de' ? 'Installieren & aktivieren' : 'Install & enable'} systemImage="checkmark.circle.fill" action={() => void finish(true, true)} />
          <Button title={lang === 'de' ? 'Nur installieren' : 'Install disabled'} action={() => void finish(true, false)} />
          <Button title={t.cancel} role="destructive" action={() => void finish(false, false)} />
        </Section>
      </List>
    </NavigationStack>
  )
}

export function ModsView() {
  const state = useModel()
  const t = strings(state.lang)
  const [, setTick] = useState(0)
  const importMod = async () => {
    const c = await model.importMod()
    if (c) await Navigation.present({ element: <ReviewSheet c={c} onDone={() => setTick((x) => x + 1)} /> })
  }
  return (
    <List navigationTitle={t.mods}>
      <Section footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {state.lang === 'de'
          ? 'gen1recomp-Mods (.zip mit manifest.json). Archive werden vor dem Entpacken auf Pfad-Tricks, Symlinks und Zip-Bomben geprüft. Aktivierte Mods werden beim Start ins Spiel eingebunden; der In-Game-Mod-Manager (F10) funktioniert weiterhin.'
          : 'gen1recomp mods (.zip with manifest.json). Archives are checked for path tricks, symlinks and zip bombs before extraction. Enabled mods are injected at launch; the in-game mod manager (F10) keeps working.'}
      </Text>}>
        <Button title={t.importMod} systemImage="square.and.arrow.down" action={() => void importMod()} />
      </Section>
      <Section title={`${t.mods} (${state.mods.length})`}>
        {state.mods.map((m) => (
          <VStack alignment="leading" spacing={4}
            trailingSwipeActions={{ actions: [<Button title={t.remove} role="destructive" action={() => void model.deleteMod(m.id)} />] }}>
            <HStack>
              <VStack alignment="leading" spacing={2}>
                <Text font="headline">{m.name}</Text>
                <Text font="caption" foregroundStyle="secondaryLabel">{`${m.version} · ${m.category ?? 'OTHER'} · ${m.games.join(', ')}`}</Text>
              </VStack>
              <Spacer />
              <Toggle title="" value={m.enabled} onChanged={(v: boolean) => void model.toggleMod(m.id, v)} />
            </HStack>
            {m.permissions.length
              ? <Text font="caption2" foregroundStyle="systemOrange">{`${t.permissions}: ${m.permissions.join(', ')}`}</Text>
              : null}
          </VStack>
        ))}
      </Section>
    </List>
  )
}
