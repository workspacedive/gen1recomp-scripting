// Saves & backups: automatic rolling backups, manual backup, export/import
// (validated ZIP), restore.
// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, HStack, List, Section, Spacer, Text, useEffect, useState, VStack } from 'scripting'
import { strings } from '../core/i18n'
import { model, useModel } from '../app/model'
import { formatBytes } from '../platform/fs'

export function SavesView() {
  const state = useModel()
  const t = strings(state.lang)
  const [backups, setBackups] = useState<{ name: string; path: string; size: number }[]>([])
  const reload = () => { void model.listBackups().then(setBackups) }
  useEffect(reload, [state.busy])
  return (
    <List navigationTitle={t.saves}>
      <Section footer={<Text font="caption2" foregroundStyle="secondaryLabel">
        {state.lang === 'de'
          ? 'Spielstände liegen in „Dateien › Scripting › RecompDeck › save". Vor jeder Sitzung wird automatisch gesichert (einstellbar).'
          : 'Saves live in “Files › Scripting › RecompDeck › save”. An automatic backup is made before every session (configurable).'}
      </Text>}>
        <Button title={t.backupNow} systemImage="externaldrive.badge.plus" action={() => void model.backupNow()} />
        <Button title={t.exportSaves} systemImage="square.and.arrow.up" action={() => void model.exportSaves()} />
        <Button title={t.importSaves} systemImage="square.and.arrow.down" action={() => void model.importSaves()} />
      </Section>
      <Section title={`Backups (${backups.length})`}>
        {backups.map((b) => (
          <HStack>
            <VStack alignment="leading" spacing={2}>
              <Text font="footnote">{b.name.replace(/^saves-/, '').replace(/\.zip$/, '')}</Text>
              <Text font="caption2" foregroundStyle="secondaryLabel">{formatBytes(b.size)}</Text>
            </VStack>
            <Spacer />
            <Button title={t.restore} buttonStyle="bordered" action={() => void model.restoreBackup(b.path)} />
          </HStack>
        ))}
      </Section>
    </List>
  )
}
