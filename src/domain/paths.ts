const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

export function safeSegment(value: string): string {
  const normalized = value.normalize('NFC')
  if (!SEGMENT.test(normalized) || normalized === '.' || normalized === '..') {
    throw new Error(`unsafe path segment: ${JSON.stringify(value)}`)
  }
  return normalized
}

export function joinUnderRoot(root: string, ...segments: readonly string[]): string {
  if (!root || root.includes('\0')) throw new Error('invalid storage root')
  const cleanRoot = root.replace(/[\\/]+$/, '')
  const clean = segments.map(safeSegment)
  return `${cleanRoot}/${clean.join('/')}`
}

export interface StorageLayout {
  readonly root: string
  readonly library: string
  readonly content: string
  readonly cores: string
  readonly profiles: string
  readonly saves: string
  readonly mods: string
  readonly generated: string
  readonly cache: string
  readonly transactions: string
  readonly diagnostics: string
  readonly recovery: string
  readonly inbox: string
  readonly exports: string
}

export function storageLayout(documentsDirectory: string): StorageLayout {
  const root = `${documentsDirectory.replace(/[\\/]+$/, '')}/Gen1Recomp`
  const at = (name: string) => joinUnderRoot(root, name)
  return {
    root,
    library: at('Library'),
    content: at('Library') + '/content',
    cores: at('Cores'),
    profiles: at('Profiles'),
    saves: at('Saves'),
    mods: at('Mods'),
    generated: at('Generated'),
    cache: at('Cache'),
    transactions: at('Transactions'),
    diagnostics: at('Diagnostics'),
    recovery: at('Recovery'),
    inbox: at('Inbox'),
    exports: at('Exports'),
  }
}
