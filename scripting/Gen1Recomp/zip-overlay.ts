export interface ZipOverlayEntry {
  path: string
  data: Uint8Array
  crc32: number
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}
function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
}
function put16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}
function put32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

function locateEocd(bytes: Uint8Array): number {
  const first = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= first; offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50 && offset + 22 + u16(bytes, offset + 20) === bytes.length) return offset
  }
  throw new Error("Der Gen1Recomp-Payload besitzt kein gültiges ZIP-Endverzeichnis.")
}

function centralNames(bytes: Uint8Array, offset: number, size: number, count: number): Set<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const names = new Set<string>()
  let cursor = offset
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > offset + size || u32(bytes, cursor) !== 0x02014b50) {
      throw new Error("Das ZIP-Endverzeichnis des Payloads ist inkonsistent.")
    }
    const nameLength = u16(bytes, cursor + 28)
    const extraLength = u16(bytes, cursor + 30)
    const commentLength = u16(bytes, cursor + 32)
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    if (names.has(name)) throw new Error(`Der Payload enthält den ZIP-Pfad doppelt: ${name}`)
    names.add(name)
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (cursor !== offset + size) throw new Error("Die Größe des Payload-Endverzeichnisses ist inkonsistent.")
  return names
}

/**
 * Produces a transient .love ZIP by preserving every upstream local record and
 * central record byte-for-byte, then adding stored entries under new paths.
 * It does not unpack, rewrite, or patch any upstream game file.
 */
export function appendZipOverlay(payload: Uint8Array, entries: ZipOverlayEntry[]): Uint8Array {
  if (entries.length === 0) return payload
  const eocd = locateEocd(payload)
  const disk = u16(payload, eocd + 4)
  const centralDisk = u16(payload, eocd + 6)
  const diskCount = u16(payload, eocd + 8)
  const count = u16(payload, eocd + 10)
  const centralSize = u32(payload, eocd + 12)
  const centralOffset = u32(payload, eocd + 16)
  if (disk !== 0 || centralDisk !== 0 || diskCount !== count || count === 0xffff ||
      centralSize === 0xffffffff || centralOffset === 0xffffffff ||
      centralOffset + centralSize !== eocd) {
    throw new Error("Mehrteilige oder ZIP64-Payloads können nicht sicher um Mods ergänzt werden.")
  }
  if (count + entries.length > 0xffff) throw new Error("Zu viele Dateien für ein ZIP32-Laufzeitpaket.")

  const existing = centralNames(payload, centralOffset, centralSize, count)
  const existingCaseFolded = new Set([...existing].map((path) => path.toLowerCase()))
  const encoder = new TextEncoder()
  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.path)
    if (!entry.path.startsWith("mods/") || entry.path.endsWith("/") || name.length === 0 || name.length > 0xffff) {
      throw new Error(`Ungültiger Mod-Laufzeitpfad: ${entry.path}`)
    }
    if (existingCaseFolded.has(entry.path.toLowerCase())) {
      throw new Error(`Der Mod-Pfad kollidiert mit dem Payload oder einem anderen Mod: ${entry.path}`)
    }
    existing.add(entry.path)
    existingCaseFolded.add(entry.path.toLowerCase())
    return { ...entry, name }
  })
  const localBytes = prepared.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0)
  const addedCentralBytes = prepared.reduce((sum, entry) => sum + 46 + entry.name.length, 0)
  const nextCentralOffset = centralOffset + localBytes
  const nextCentralSize = centralSize + addedCentralBytes
  const outputSize = nextCentralOffset + nextCentralSize + 22
  if (outputSize > 0xffffffff) throw new Error("Das Laufzeitpaket überschreitet das ZIP32-Limit.")
  const output = new Uint8Array(outputSize)
  output.set(payload.slice(0, centralOffset), 0)

  let localCursor = centralOffset
  const localOffsets: number[] = []
  for (const entry of prepared) {
    localOffsets.push(localCursor)
    put32(output, localCursor, 0x04034b50)
    put16(output, localCursor + 4, 20)
    put16(output, localCursor + 6, 0x0800)
    put16(output, localCursor + 8, 0)
    put32(output, localCursor + 14, entry.crc32)
    put32(output, localCursor + 18, entry.data.length)
    put32(output, localCursor + 22, entry.data.length)
    put16(output, localCursor + 26, entry.name.length)
    output.set(entry.name, localCursor + 30)
    output.set(entry.data, localCursor + 30 + entry.name.length)
    localCursor += 30 + entry.name.length + entry.data.length
  }
  output.set(payload.slice(centralOffset, centralOffset + centralSize), localCursor)
  let centralCursor = localCursor + centralSize
  prepared.forEach((entry, index) => {
    put32(output, centralCursor, 0x02014b50)
    put16(output, centralCursor + 4, 20)
    put16(output, centralCursor + 6, 20)
    put16(output, centralCursor + 8, 0x0800)
    put16(output, centralCursor + 10, 0)
    put32(output, centralCursor + 16, entry.crc32)
    put32(output, centralCursor + 20, entry.data.length)
    put32(output, centralCursor + 24, entry.data.length)
    put16(output, centralCursor + 28, entry.name.length)
    put32(output, centralCursor + 38, 0)
    put32(output, centralCursor + 42, localOffsets[index]!)
    output.set(entry.name, centralCursor + 46)
    centralCursor += 46 + entry.name.length
  })
  put32(output, centralCursor, 0x06054b50)
  put16(output, centralCursor + 8, count + prepared.length)
  put16(output, centralCursor + 10, count + prepared.length)
  put32(output, centralCursor + 12, nextCentralSize)
  put32(output, centralCursor + 16, nextCentralOffset)
  return output
}
