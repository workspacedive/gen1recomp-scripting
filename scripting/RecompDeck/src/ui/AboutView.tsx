// About, credits (mandatory attribution) and third-party licenses.
// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, List, Section, Text } from 'scripting'
import { APP_NAME, APP_VERSION, CREDIT_LINE, PROJECT_URL, UPSTREAM_URL } from '../core/constants'
import { strings } from '../core/i18n'
import { useModel } from '../app/model'

export function AboutView() {
  const state = useModel()
  const t = strings(state.lang)
  const de = state.lang === 'de'
  return (
    <List navigationTitle={t.about}>
      <Section title="Credit">
        <Text font="headline">{CREDIT_LINE}</Text>
        <Button title="gen1recomp on GitHub" systemImage="link" action={() => void Safari.openURL(UPSTREAM_URL)} />
      </Section>
      <Section title={APP_NAME}>
        <Text font="footnote">{`${APP_NAME} ${APP_VERSION} — ${de
          ? 'ein inoffizielles, quelloffenes iOS-Frontend (Scripting-App). Es enthält keinerlei Spielcode, ROM-Daten oder Spielinhalte: Das offizielle gen1recomp-Release wird von dir selbst von GitHub geladen, unverändert und prüfsummengesichert ausgeführt; deine eigene ROM wird nur lokal verwendet.'
          : 'an unofficial, open-source iOS frontend (Scripting app). It contains no game code, ROM data or game content: the official gen1recomp release is downloaded by you from GitHub and run unmodified and checksum-verified; your own ROM is used locally only.'}`}</Text>
        <Text font="footnote">{de
          ? 'Lizenz: GPL-3.0-or-later. Nicht verbunden mit BOIS CLUB GAMES, LLC, Nintendo, Creatures Inc., GAME FREAK inc. oder The Pokémon Company. Pokémon und alle zugehörigen Namen sind Marken ihrer jeweiligen Inhaber.'
          : 'License: GPL-3.0-or-later. Not affiliated with BOIS CLUB GAMES, LLC, Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company. Pokémon and all related names are trademarks of their respective owners.'}</Text>
        <Button title="RecompDeck on GitHub" systemImage="link" action={() => void Safari.openURL(PROJECT_URL)} />
      </Section>
      <Section title={de ? 'Drittanbieter' : 'Third-party components'}>
        <Text font="footnote">{[
          'gen1recomp — © BOIS CLUB GAMES, LLC, GPLv3 + additional terms (downloaded at runtime, not bundled)',
          'LÖVE 11.5 — © LÖVE Development Team, zlib license',
          'love.js (Emscripten port) — Davidobot, Tanner Rogalsky, jeduden; MIT',
          'Lua 5.1 — © Lua.org, PUC-Rio; MIT',
          'SDL2, OpenAL, FreeType, PhysFS etc. inside love.wasm — respective permissive licenses',
        ].join('\n')}</Text>
      </Section>
    </List>
  )
}
