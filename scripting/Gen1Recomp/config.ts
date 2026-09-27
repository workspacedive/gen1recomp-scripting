export const APP = {
  version: '0.13.3',
  storageSchema: 1,
  librarySchema: 1,
  capabilitySchema: 3,
  defaultLocale: 'de' as const,
  maxImportBytes: 64 * 1024 * 1024,
  runtimeEnabled: true,
  requiredCoreHostContract: 1,
} as const

export const THEME = {
  red: '#c13034',
  blue: '#2864a8',
  yellow: '#d6a313',
  game: { red: '#c13034', blue: '#2864a8', yellow: '#d6a313', unknown: '#6b7280' },
} as const
