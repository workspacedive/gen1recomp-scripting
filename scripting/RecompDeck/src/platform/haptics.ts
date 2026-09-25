// Haptics via HapticFeedback (free tier; the newer "Haptics" module is PRO).
// SPDX-License-Identifier: GPL-3.0-or-later

let last = 0

export function playHaptic(style: 'light' | 'medium' | 'heavy') {
  const now = Date.now()
  if (now - last < 30) return // the game can request rumble every frame
  last = now
  try {
    if (style === 'light') HapticFeedback.lightImpact()
    else if (style === 'heavy') HapticFeedback.heavyImpact()
    else HapticFeedback.mediumImpact()
  } catch {
    /* unsupported device */
  }
}
