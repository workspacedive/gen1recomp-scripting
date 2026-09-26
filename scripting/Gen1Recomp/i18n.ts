export type Locale = 'de' | 'en'

const strings = {
  de: {
    library: 'SPIELE', import: 'Spiel importieren', importing: 'Import läuft …', empty: 'Noch kein Spiel importiert',
    files: 'Dateien', diagnostics: 'RUNTIME-GATE', capabilities: 'Gerätefähigkeiten prüfen',
    ready: 'Bereit', unknown: 'Runtime ungeprüft', settings: 'SPEICHER & SICHERHEIT',
    free: 'Free-Tier · keine Pro-API', note: 'Spielstart bleibt bis love.js-Boot, Audio, lokale Dateien und Save-Recovery gesperrt.',
    close: 'Schließen', imported: 'Sicher importiert', unsupported: 'Nicht unterstützter Inhalt',
    known: 'Verifiziertes Spiel', probeOnly: 'Die Probe zertifiziert noch keine spielbare Runtime.',
    gateBlocked: 'Spielstart gesperrt', gateProbe: 'Geräteprüfung erforderlich', gateCandidate: 'Runtime-Kandidat',
    criticalStorage: 'Saves und Originale liegen nie nur im Cache.', recovery: 'Unterbrochene Imports werden beim Start sicher bereinigt.',
  },
  en: {
    library: 'GAMES', import: 'Import game', importing: 'Importing …', empty: 'No game imported yet',
    files: 'Files', diagnostics: 'RUNTIME GATE', capabilities: 'Probe device capabilities',
    ready: 'Ready', unknown: 'Runtime not verified', settings: 'STORAGE & SECURITY',
    free: 'Free tier · no Pro API', note: 'Launch remains blocked until love.js boot, audio, local files, and save recovery pass.',
    close: 'Close', imported: 'Safely imported', unsupported: 'Unsupported content',
    known: 'Verified game', probeOnly: 'The probe does not certify a playable runtime yet.',
    gateBlocked: 'Launch blocked', gateProbe: 'Device probe required', gateCandidate: 'Runtime candidate',
    criticalStorage: 'Saves and originals never live only in cache.', recovery: 'Interrupted imports are safely recovered at startup.',
  },
} as const

export function t(locale: Locale, key: keyof typeof strings.de): string {
  return strings[locale][key]
}
