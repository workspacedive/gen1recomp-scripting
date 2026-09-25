// Settings persistence (Storage, free tier) with sanitising on every read.
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_SETTINGS, Settings, sanitizeSettings } from '../core/settings'

const KEY = 'recompdeck.settings.v1'

export function loadSettings(): Settings {
  try {
    return sanitizeSettings(Storage.get<Settings>(KEY) ?? DEFAULT_SETTINGS)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): Settings {
  const clean = sanitizeSettings(s)
  Storage.set(KEY, clean)
  return clean
}

/** Small key/value state shared with the widget (App Group storage). */
export function setShared<T>(key: string, value: T) {
  try { Storage.set('recompdeck.' + key, value, { shared: true }) } catch { /* optional */ }
}

export function getShared<T>(key: string): T | null {
  try { return Storage.get<T>('recompdeck.' + key, { shared: true }) } catch { return null }
}
