// Settings: graphics, performance, controls, storage, language, diagnostics.
// SPDX-License-Identifier: GPL-3.0-or-later

import { List, Picker, Section, Stepper, Text, Toggle } from 'scripting'
import { strings } from '../core/i18n'
import type { FpsCap, Settings } from '../core/settings'
import { model, useModel } from '../app/model'

export function SettingsView() {
  const state = useModel()
  const s = state.settings
  const t = strings(state.lang)
  const de = state.lang === 'de'
  const set = (patch: Partial<Settings>) => model.updateSettings(patch)
  return (
    <List navigationTitle={t.settings}>
      <Section header={<Text>t.graphics</Text>} footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {de
          ? 'Grafik-Effekte, Paletten, Zoom und 3D-Tilt stellst du im Spiel unter OPTIONS ein. Hier geht es um die Darstellung der Laufzeit.'
          : 'Shader effects, palettes, zoom and 3D tilt are in the game\'s OPTIONS menu. These settings control the runtime presentation.'}
      </Text>}>
        <Picker title={t.fpsCap} value={s.fpsCap} onChanged={(v: number) => set({ fpsCap: v as FpsCap })}>
          <Text tag={30}>{de ? '30 fps (Akku sparen)' : '30 fps (battery saver)'}</Text>
          <Text tag={60}>{de ? '60 fps (Original)' : '60 fps (native)'}</Text>
          <Text tag={120}>120 fps (ProMotion)</Text>
          <Text tag={0}>{de ? 'Bildschirmrate' : 'Display rate'}</Text>
        </Picker>
        <Toggle title={t.sharpRendering} value={s.highdpi} onChanged={(v: boolean) => set({ highdpi: v })} />
        <Toggle title={t.pixelated} value={s.pixelated} onChanged={(v: boolean) => set({ pixelated: v })} />
        <Toggle title={t.fillEdges} value={s.fillEdges} onChanged={(v: boolean) => set({ fillEdges: v })} />
      </Section>
      <Section header={<Text>t.performance</Text>} footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {de
          ? 'Der Speicher wächst bei Bedarf automatisch. Die Leistungsstufe (HIGH/BALANCED/LOW) wählst du im Spiel.'
          : 'Memory grows automatically when needed. The performance tier (HIGH/BALANCED/LOW) is selected in the game.'}
      </Text>}>
        <Picker title={t.memory} value={s.memoryMB} onChanged={(v: number) => set({ memoryMB: v as Settings['memoryMB'] })}>
          <Text tag={128}>128 MB</Text>
          <Text tag={192}>192 MB</Text>
          <Text tag={256}>256 MB</Text>
          <Text tag={384}>384 MB</Text>
        </Picker>
      </Section>
      <Section header={<Text>t.controls</Text>} footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {de
          ? 'Touch-Steuerung, Layout und Gamepad-Belegung stellst du im Spiel ein (OPTIONS › CONTROLS). Bluetooth-Controller und Tastaturen werden unterstützt.'
          : 'Touch controls, layout and gamepad bindings are configured in the game (OPTIONS › CONTROLS). Bluetooth controllers and keyboards are supported.'}
      </Text>}>
        <Toggle title={t.haptics} value={s.haptics} onChanged={(v: boolean) => set({ haptics: v })} />
        <Picker title={de ? 'Gemeldetes System' : 'Reported platform'} value={s.reportOS} onChanged={(v: string) => set({ reportOS: v === 'Web' ? 'Web' : 'iOS' })}>
          <Text tag="iOS">{de ? 'iOS (Touch-Layout, empfohlen)' : 'iOS (touch layout, recommended)'}</Text>
          <Text tag="Web">{de ? 'Web (Desktop-Layout)' : 'Web (desktop layout)'}</Text>
        </Picker>
      </Section>
      <Section title={t.saves}>
        <Toggle title={de ? 'Automatisches Backup vor jeder Sitzung' : 'Automatic backup before each session'} value={s.autoBackup} onChanged={(v: boolean) => set({ autoBackup: v })} />
        <Stepper title={`${de ? 'Behalten' : 'Keep'}: ${s.backupsToKeep}`} onIncrement={() => set({ backupsToKeep: Math.min(50, s.backupsToKeep + 1) })}
          onDecrement={() => set({ backupsToKeep: Math.max(1, s.backupsToKeep - 1) })} />
      </Section>
      <Section title={t.language}>
        <Picker title={t.language} value={s.language} onChanged={(v: string) => set({ language: v === 'de' || v === 'en' ? v : 'auto' })}>
          <Text tag="auto">Auto</Text>
          <Text tag="de">Deutsch</Text>
          <Text tag="en">English</Text>
        </Picker>
        <Toggle title={t.updates} value={s.checkUpdates} onChanged={(v: boolean) => set({ checkUpdates: v })} />
      </Section>
      <Section title={t.diagnostics}>
        <Toggle title={de ? 'Diagnosemodus (Selbsttest, Leistungsdaten)' : 'Diagnostics mode (self-test, performance data)'} value={s.debug} onChanged={(v: boolean) => set({ debug: v })} />
      </Section>
    </List>
  )
}
