export type Locale = 'de' | 'en'

const strings = {
  de: {
    library: 'SPIELE', import: 'Spiel importieren', importing: 'Import läuft …', empty: 'Noch kein Spiel importiert',
    files: 'Dateien', diagnostics: 'RUNTIME-GATE', capabilities: 'Gerätefähigkeiten prüfen', probing: 'Geräteprüfung läuft …',
    ready: 'Bereit', unknown: 'Runtime ungeprüft', settings: 'SPEICHER & SICHERHEIT',
    free: 'Free-Tier · keine Pro-API', note: 'Spielstart bleibt bis love.js-Boot, Audio, lokale Dateien und Save-Recovery gesperrt.',
    close: 'Schließen', imported: 'Sicher importiert', unsupported: 'Nicht unterstützter Inhalt',
    known: 'Verifiziertes Spiel', probeOnly: 'Die Probe zertifiziert noch keine spielbare Runtime.',
    gateBlocked: 'Spielstart gesperrt', gateProbe: 'Geräteprüfung erforderlich', gateCandidate: 'Runtime-Kandidat',
    criticalStorage: 'Saves und Originale liegen nie nur im Cache.', recovery: 'Unterbrochene Imports werden beim Start sicher bereinigt.',
  },
  en: {
    library: 'GAMES', import: 'Import game', importing: 'Importing …', empty: 'No game imported yet',
    files: 'Files', diagnostics: 'RUNTIME GATE', capabilities: 'Probe device capabilities', probing: 'Probing device …',
    ready: 'Ready', unknown: 'Runtime not verified', settings: 'STORAGE & SECURITY',
    free: 'Free tier · no Pro API', note: 'Launch remains blocked until love.js boot, audio, local files, and save recovery pass.',
    close: 'Close', imported: 'Safely imported', unsupported: 'Unsupported content',
    known: 'Verified game', probeOnly: 'The probe does not certify a playable runtime yet.',
    gateBlocked: 'Launch blocked', gateProbe: 'Device probe required', gateCandidate: 'Runtime candidate',
    criticalStorage: 'Saves and originals never live only in cache.', recovery: 'Interrupted imports are safely recovered at startup.',
  },
} as const

const runtimeReasons: Record<Locale, Record<string, string>> = {
  de: {
    'capability-probe.required': 'Geräteprüfung fehlt',
    'core.missing': 'love.js-Core ist noch nicht installiert',
    'host.wasm.unavailable': 'WebAssembly kann nicht ausgeführt werden',
    'host.webgl.unavailable': 'WebGL-Renderprobe fehlgeschlagen',
    'host.audio.unavailable': 'WebAudio-Kontext nicht verfügbar',
    'host.indexeddb.unavailable': 'IndexedDB-API nicht verfügbar',
    'host.local-script-subresource.unavailable': 'Lokale Subresource konnte nicht geladen werden',
    'host.wasm-subresource.unknown': 'Lokales WASM-/Data-Laden noch ungeprüft',
    'host.persistent-vfs.unknown': 'Persistente Runtime-Saves noch ungeprüft',
    'runtime.feature-disabled': 'Runtime bleibt bis zur Geräteabnahme deaktiviert',
  },
  en: {
    'capability-probe.required': 'Device probe is missing',
    'core.missing': 'love.js core is not installed yet',
    'host.wasm.unavailable': 'WebAssembly cannot execute',
    'host.webgl.unavailable': 'WebGL rendering probe failed',
    'host.audio.unavailable': 'Web Audio context is unavailable',
    'host.indexeddb.unavailable': 'IndexedDB API is unavailable',
    'host.local-script-subresource.unavailable': 'Local subresource did not load',
    'host.wasm-subresource.unknown': 'Local WASM/data loading is not tested',
    'host.persistent-vfs.unknown': 'Persistent runtime saves are not tested',
    'runtime.feature-disabled': 'Runtime remains disabled until device acceptance',
  },
}

export function t(locale: Locale, key: keyof typeof strings.de): string {
  return strings[locale][key]
}

export function runtimeReason(locale: Locale, code: string): string {
  return runtimeReasons[locale][code] ?? code
}
