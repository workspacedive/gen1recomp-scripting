export const MOD_ARCHIVE_LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  entryBytes: 128 * 1024 * 1024,
  entries: 32_768,
  expansionRatio: 200,
})

export interface ZipEntry {
  path: string
  flags: number
  method: 0 | 8
  crc32: number
  compressedBytes: number
  expandedBytes: number
  localOffset: number
  centralOffset: number
  isDirectory: boolean
}

export interface ZipPreflight {
  entries: string[]
  records: ZipEntry[]
  compressedBytes: number
  expandedBytes: number
  rootPrefix: string
  manifestPath: string
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
}

function signature(bytes: Uint8Array, offset: number, expected: number): boolean {
  return offset >= 0 && offset + 4 <= bytes.length && u32(bytes, offset) === expected
}

function safePath(raw: string): string {
  if (!raw || raw !== raw.normalize("NFC") || /[\u0000-\u001f\u007f]/.test(raw) ||
      raw.includes("\\") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    throw new Error("Das ZIP enthält einen unsicheren Pfad.")
  }
  const isDirectory = raw.endsWith("/")
  const parts = raw.split("/").filter((part, index, all) =>
    !(part === "" && index === all.length - 1 && isDirectory))
  if (parts.length === 0 || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Das ZIP enthält einen unsicheren Pfad.")
  }
  if (parts.some((part) => part.length > 255) || raw.length > 1024) {
    throw new Error("Ein Pfad im ZIP ist zu lang.")
  }
  return parts.join("/") + (isDirectory ? "/" : "")
}

function locateRoot(paths: string[]): { rootPrefix: string, manifestPath: string } {
  if (paths.includes("manifest.json")) {
    return { rootPrefix: "", manifestPath: "manifest.json" }
  }
  const top = new Set<string>()
  for (const path of paths) top.add(path.split("/")[0]!)
  if (top.size !== 1) {
    throw new Error("Das ZIP muss genau einen Mod-Ordner enthalten.")
  }
  const rootPrefix = [...top][0]!
  const manifestPath = `${rootPrefix}/manifest.json`
  if (!paths.includes(manifestPath)) {
    throw new Error("Im ZIP wurde keine manifest.json gefunden.")
  }
  return { rootPrefix, manifestPath }
}

/**
 * Parses only the ZIP central directory. No archive entry is trusted or
 * extracted until this function accepts every path and size.
 */
function preflightZip(bytes: Uint8Array, requireModManifest: boolean): ZipPreflight {
  if (bytes.length < 22 || bytes.length > MOD_ARCHIVE_LIMITS.archiveBytes) {
    throw new Error("Das Mod-ZIP ist leer, beschädigt oder zu groß (maximal 64 MiB).")
  }

  const lower = Math.max(0, bytes.length - 65_557)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= lower; offset -= 1) {
    if (signature(bytes, offset, 0x06054b50)) {
      const commentLength = u16(bytes, offset + 20)
      if (offset + 22 + commentLength === bytes.length) {
        eocd = offset
        break
      }
    }
  }
  if (eocd < 0) throw new Error("Das ZIP-Endverzeichnis fehlt.")

  const disk = u16(bytes, eocd + 4)
  const centralDisk = u16(bytes, eocd + 6)
  const diskEntries = u16(bytes, eocd + 8)
  const totalEntries = u16(bytes, eocd + 10)
  const centralSize = u32(bytes, eocd + 12)
  const centralOffset = u32(bytes, eocd + 16)
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error("Mehrteilige ZIP-Dateien werden nicht unterstützt.")
  }
  if (totalEntries === 0 || totalEntries === 0xffff || centralSize === 0xffffffff ||
      centralOffset === 0xffffffff) {
    throw new Error("Leere oder ZIP64-Modpakete werden nicht unterstützt.")
  }
  if (totalEntries > MOD_ARCHIVE_LIMITS.entries) {
    throw new Error(`Das ZIP enthält ${totalEntries} Einträge; erlaubt sind höchstens ${MOD_ARCHIVE_LIMITS.entries}.`)
  }
  if (centralOffset + centralSize > eocd) {
    throw new Error("Das ZIP-Zentralverzeichnis liegt außerhalb seiner gültigen Grenzen.")
  }

  const decoder = new TextDecoder("utf-8", { fatal: true })
  const entries: string[] = []
  const records: ZipEntry[] = []
  const seen = new Set<string>()
  let compressedBytes = 0
  let expandedBytes = 0
  let cursor = centralOffset
  for (let index = 0; index < totalEntries; index += 1) {
    if (!signature(bytes, cursor, 0x02014b50) || cursor + 46 > bytes.length) {
      throw new Error("Das ZIP-Zentralverzeichnis ist beschädigt.")
    }
    const madeBy = u16(bytes, cursor + 4)
    const flags = u16(bytes, cursor + 8)
    const method = u16(bytes, cursor + 10)
    const entryCrc32 = u32(bytes, cursor + 16)
    const compressed = u32(bytes, cursor + 20)
    const expanded = u32(bytes, cursor + 24)
    const nameLength = u16(bytes, cursor + 28)
    const extraLength = u16(bytes, cursor + 30)
    const commentLength = u16(bytes, cursor + 32)
    const diskStart = u16(bytes, cursor + 34)
    const external = u32(bytes, cursor + 38)
    const localOffset = u32(bytes, cursor + 42)
    const end = cursor + 46 + nameLength + extraLength + commentLength
    if (end > centralOffset + centralSize || diskStart !== 0 || nameLength === 0) {
      throw new Error("Ein ZIP-Eintrag ist beschädigt.")
    }
    const allowedFlags = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 11)
    if ((flags & ~allowedFlags) !== 0 || (method !== 0 && method !== 8)) {
      throw new Error("Verschlüsselte, gepatchte oder unbekannt komprimierte ZIP-Einträge sind nicht erlaubt.")
    }
    if (compressed === 0xffffffff || expanded === 0xffffffff || localOffset === 0xffffffff ||
        expanded > MOD_ARCHIVE_LIMITS.entryBytes) {
      throw new Error("Ein ZIP-Eintrag ist zu groß oder verwendet ZIP64.")
    }
    if (method === 0 && compressed !== expanded) {
      throw new Error("Ein unkomprimierter ZIP-Eintrag meldet widersprüchliche Größen.")
    }
    const unixHost = (madeBy >>> 8) === 3
    const unixMode = external >>> 16
    if (unixHost && (unixMode & 0xf000) === 0xa000) {
      throw new Error("Symbolische Links sind in Mod-ZIPs nicht erlaubt.")
    }
    let raw: string
    try {
      raw = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    } catch {
      throw new Error("Ein ZIP-Pfad ist nicht gültiges UTF-8.")
    }
    const path = safePath(raw)
    const canonical = path.toLocaleLowerCase("en-US")
    if (seen.has(canonical)) throw new Error("Das ZIP enthält doppelte Dateipfade.")
    seen.add(canonical)
    entries.push(path)
    records.push({
      path,
      flags,
      method: method as 0 | 8,
      crc32: entryCrc32,
      compressedBytes: compressed,
      expandedBytes: expanded,
      localOffset,
      centralOffset,
      isDirectory: path.endsWith("/"),
    })
    compressedBytes += compressed
    expandedBytes += expanded
    if (expandedBytes > MOD_ARCHIVE_LIMITS.expandedBytes) {
      throw new Error("Das entpackte Modpaket wäre zu groß (maximal 512 MiB).")
    }
    cursor = end
  }
  if (cursor !== centralOffset + centralSize) {
    throw new Error("Das ZIP-Zentralverzeichnis hat unerwartete Zusatzdaten.")
  }
  if (expandedBytes > 1024 * 1024 &&
      expandedBytes > Math.max(1, compressedBytes) * MOD_ARCHIVE_LIMITS.expansionRatio) {
    throw new Error(`Das ZIP überschreitet das erlaubte Entpackverhältnis von ${MOD_ARCHIVE_LIMITS.expansionRatio}:1.`)
  }
  const root = requireModManifest
    ? locateRoot(entries.filter((path) => !path.endsWith("/")))
    : { rootPrefix: "", manifestPath: "" }
  return { entries, records, compressedBytes, expandedBytes, ...root }
}

export function preflightModZip(bytes: Uint8Array): ZipPreflight {
  return preflightZip(bytes, true)
}

export function preflightZipArchive(bytes: Uint8Array): ZipPreflight {
  return preflightZip(bytes, false)
}
