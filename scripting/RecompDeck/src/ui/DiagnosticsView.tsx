// Diagnostics: versions, storage use, last session statistics, logs.
// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, List, Section, Text, useEffect, useState } from 'scripting'
import { APP_VERSION } from '../core/constants'
import { RUNTIME_PIN } from '../core/pins'
import { strings } from '../core/i18n'
import { model, useModel } from '../app/model'
import { dirSize, DIRS, formatBytes } from '../platform/fs'
import { recentLogs } from '../platform/log'

export function DiagnosticsView() {
  const state = useModel()
  const t = strings(state.lang)
  const [sizes, setSizes] = useState<string>('…')
  useEffect(() => {
    void (async () => {
      const parts: string[] = []
      for (const [k, dir] of [['runtime', DIRS.runtime], ['games', DIRS.games], ['cache', DIRS.cache], ['save', DIRS.save], ['mods', DIRS.mods], ['backups', DIRS.backups], ['player', DIRS.player]] as const) {
        parts.push(`${k}: ${formatBytes(await dirSize(dir))}`)
      }
      setSizes(parts.join('\n'))
    })()
  }, [])
  const logs = recentLogs().slice(-80).join('\n')
  const last = state.lastSession
  return (
    <List navigationTitle={t.diagnostics}>
      <Section title="Versions">
        <Text font="footnote" textSelection={true}>{[
          `RecompDeck ${APP_VERSION}`,
          `Runtime: ${RUNTIME_PIN.label} (${state.runtime?.installed ? t.installed : t.notInstalled})`,
          `Game: ${state.game ? `v${state.game.version} (${state.game.verified}, sha256 ${state.game.sha256.slice(0, 16)}…)` : t.notInstalled}`,
          `Script: ${model.scriptName()}`,
        ].join('\n')}</Text>
      </Section>
      <Section title="Storage">
        <Text font="footnote" textSelection={true}>{sizes}</Text>
      </Section>
      {last
        ? <Section title={state.lang === 'de' ? 'Letzte Sitzung' : 'Last session'}>
          <Text font="footnote" textSelection={true}>{JSON.stringify(last.stats, null, 1)}</Text>
          {last.error ? <Text font="footnote" foregroundStyle="systemRed" textSelection={true}>{last.error}</Text> : null}
        </Section>
        : null}
      <Section title="Log">
        <Text font="caption2" textSelection={true}>{logs || '—'}</Text>
        <Button title={state.lang === 'de' ? 'Log teilen' : 'Share log'} systemImage="square.and.arrow.up"
          action={() => void ShareSheet.present([logs])} />
      </Section>
    </List>
  )
}
