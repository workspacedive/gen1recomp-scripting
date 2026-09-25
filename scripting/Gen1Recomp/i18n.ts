export type Locale = 'de' | 'en'

const strings = {
  de: {
    library: 'SPIELE', import: 'Spiel importieren', empty: 'Noch kein Spiel importiert',
    files: 'Dateien', diagnostics: 'DIAGNOSE', capabilities: 'Runtime prüfen',
    ready: 'Bereit', unknown: 'Runtime ungeprüft', settings: 'EINSTELLUNGEN',
    free: 'Free-Tier · keine Pro-API', note: 'Die Runtime wird erst nach bestandenem Geräte-Test aktiviert.',
    close: 'Schließen', imported: 'Importiert', unsupported: 'Unbekannter Inhalt',
  },
  en: {
    library: 'GAMES', import: 'Import game', empty: 'No game imported yet',
    files: 'Files', diagnostics: 'DIAGNOSTICS', capabilities: 'Probe runtime',
    ready: 'Ready', unknown: 'Runtime not verified', settings: 'SETTINGS',
    free: 'Free tier · no Pro API', note: 'Runtime stays disabled until the device gate passes.',
    close: 'Close', imported: 'Imported', unsupported: 'Unknown content',
  },
} as const

export function t(locale: Locale, key: keyof typeof strings.de): string {
  return strings[locale][key]
}
