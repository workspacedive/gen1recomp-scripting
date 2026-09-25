// RecompDeck — entry point (Scripting app, index host).
// Lifecycle: one launcher page presented full screen; Script.exit() after it
// is dismissed (finite page model, see the scripting-app-development skill).
// Deep links: scripting://run/RecompDeck?game=red&slot=2 (mirrors the official
// gen1recomp++://launch?game=&slot= keys).
// SPDX-License-Identifier: GPL-3.0-or-later

import { Navigation, Script } from 'scripting'
import { model } from './src/app/model'
import { requestFromQuery } from './src/core/launch'
import { log } from './src/platform/log'
import { HomeView } from './src/ui/HomeView'

async function main() {
  try {
    await model.init()
  } catch (e) {
    log('error', 'init failed: ' + String(e))
  }
  const deepLink = requestFromQuery(Script.queryParameters)
  await Navigation.present({
    element: <HomeView deepLink={deepLink} />,
    modalPresentationStyle: 'fullScreen',
  })
  Script.exit()
}

main()
