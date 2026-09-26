import type { ZipEntry } from "./zip-preflight.js"

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error("ZIP-Daten enden unerwartet.")
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error("ZIP-Daten enden unerwartet.")
  return (bytes[offset]! | (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
}

class BitReader {
  private bit = 0
  constructor(private readonly bytes: Uint8Array) {}

  readBits(count: number): number {
    if (count < 0 || count > 24 || this.bit + count > this.bytes.length * 8) {
      throw new Error("Der DEFLATE-Datenstrom endet unerwartet.")
    }
    let value = 0
    for (let index = 0; index < count; index += 1) {
      value |= ((this.bytes[this.bit >>> 3]! >>> (this.bit & 7)) & 1) << index
      this.bit += 1
    }
    return value >>> 0
  }

  alignByte(): void { this.bit = (this.bit + 7) & ~7 }
  remainingBits(): number { return this.bytes.length * 8 - this.bit }
}

interface Huffman {
  maxBits: number
  symbols: Map<number, number>
}

function reverseBits(value: number, count: number): number {
  let reversed = 0
  for (let index = 0; index < count; index += 1) {
    reversed = (reversed << 1) | ((value >>> index) & 1)
  }
  return reversed
}

function buildHuffman(lengths: number[], allowIncomplete = false): Huffman {
  const counts = new Array<number>(16).fill(0)
  let symbolsWithCodes = 0
  for (const length of lengths) {
    if (!Number.isInteger(length) || length < 0 || length > 15) throw new Error("Ungültiger Huffman-Code.")
    if (length > 0) { counts[length] = counts[length]! + 1; symbolsWithCodes += 1 }
  }
  if (symbolsWithCodes === 0) throw new Error("Leere Huffman-Tabelle.")
  let remaining = 1
  for (let bits = 1; bits <= 15; bits += 1) {
    remaining = (remaining << 1) - counts[bits]!
    if (remaining < 0) throw new Error("Überbelegte Huffman-Tabelle.")
  }
  if (!allowIncomplete && remaining !== 0) throw new Error("Unvollständige Huffman-Tabelle.")

  const next = new Array<number>(16).fill(0)
  let code = 0
  for (let bits = 1; bits <= 15; bits += 1) {
    code = (code + counts[bits - 1]!) << 1
    next[bits] = code
  }
  const symbols = new Map<number, number>()
  let maxBits = 0
  lengths.forEach((length, symbol) => {
    if (length === 0) return
    const canonical = next[length]!
    next[length] = canonical + 1
    symbols.set((length << 16) | reverseBits(canonical, length), symbol)
    if (length > maxBits) maxBits = length
  })
  return { maxBits, symbols }
}

function decodeSymbol(reader: BitReader, table: Huffman): number {
  let code = 0
  for (let length = 1; length <= table.maxBits; length += 1) {
    code |= reader.readBits(1) << (length - 1)
    const symbol = table.symbols.get((length << 16) | code)
    if (symbol != null) return symbol
  }
  throw new Error("Unbekannter Huffman-Code im DEFLATE-Datenstrom.")
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]

let fixedLiteral: Huffman | null = null
let fixedDistance: Huffman | null = null

function fixedTables(): [Huffman, Huffman] {
  if (fixedLiteral == null) {
    const lengths = new Array<number>(288).fill(0)
    for (let symbol = 0; symbol <= 143; symbol += 1) lengths[symbol] = 8
    for (let symbol = 144; symbol <= 255; symbol += 1) lengths[symbol] = 9
    for (let symbol = 256; symbol <= 279; symbol += 1) lengths[symbol] = 7
    for (let symbol = 280; symbol <= 287; symbol += 1) lengths[symbol] = 8
    fixedLiteral = buildHuffman(lengths)
    fixedDistance = buildHuffman(new Array<number>(32).fill(5))
  }
  return [fixedLiteral, fixedDistance!]
}

function dynamicTables(reader: BitReader): [Huffman, Huffman] {
  const literalCount = reader.readBits(5) + 257
  const distanceCount = reader.readBits(5) + 1
  const codeLengthCount = reader.readBits(4) + 4
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
  const codeLengths = new Array<number>(19).fill(0)
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengths[order[index]!] = reader.readBits(3)
  }
  const codeTable = buildHuffman(codeLengths, true)
  const lengths: number[] = []
  const total = literalCount + distanceCount
  while (lengths.length < total) {
    const symbol = decodeSymbol(reader, codeTable)
    if (symbol <= 15) {
      lengths.push(symbol)
    } else if (symbol === 16) {
      if (lengths.length === 0) throw new Error("DEFLATE-Wiederholung ohne vorherigen Code.")
      const repeat = reader.readBits(2) + 3
      const previous = lengths[lengths.length - 1]!
      for (let index = 0; index < repeat; index += 1) lengths.push(previous)
    } else if (symbol === 17) {
      const repeat = reader.readBits(3) + 3
      for (let index = 0; index < repeat; index += 1) lengths.push(0)
    } else if (symbol === 18) {
      const repeat = reader.readBits(7) + 11
      for (let index = 0; index < repeat; index += 1) lengths.push(0)
    } else {
      throw new Error("Ungültiger Code-Längenwert im DEFLATE-Datenstrom.")
    }
    if (lengths.length > total) throw new Error("Zu viele DEFLATE-Code-Längen.")
  }
  if (lengths[256] === 0) throw new Error("DEFLATE-Endsymbol fehlt.")
  const literal = buildHuffman(lengths.slice(0, literalCount), true)
  const distanceLengths = lengths.slice(literalCount)
  // RFC 1951 permits a single distance code in an otherwise incomplete tree.
  const distance = buildHuffman(distanceLengths, true)
  return [literal, distance]
}

export function inflateRaw(compressed: Uint8Array, expectedBytes: number): Uint8Array {
  if (!Number.isInteger(expectedBytes) || expectedBytes < 0) throw new Error("Ungültige DEFLATE-Zielgröße.")
  const output = new Uint8Array(expectedBytes)
  const reader = new BitReader(compressed)
  let written = 0
  let final = false
  while (!final) {
    final = reader.readBits(1) === 1
    const type = reader.readBits(2)
    if (type === 0) {
      reader.alignByte()
      const length = reader.readBits(16)
      const complement = reader.readBits(16)
      if (((length ^ 0xffff) & 0xffff) !== complement) throw new Error("Beschädigter unkomprimierter DEFLATE-Block.")
      if (written + length > output.length) throw new Error("DEFLATE-Ausgabe überschreitet die angekündigte Größe.")
      for (let index = 0; index < length; index += 1) output[written++] = reader.readBits(8)
      continue
    }
    if (type === 3) throw new Error("Reservierter DEFLATE-Blocktyp.")
    const [literalTable, distanceTable] = type === 1 ? fixedTables() : dynamicTables(reader)
    while (true) {
      const symbol = decodeSymbol(reader, literalTable)
      if (symbol < 256) {
        if (written >= output.length) throw new Error("DEFLATE-Ausgabe überschreitet die angekündigte Größe.")
        output[written++] = symbol
        continue
      }
      if (symbol === 256) break
      if (symbol < 257 || symbol > 285) throw new Error("Ungültiger DEFLATE-Längencode.")
      const lengthIndex = symbol - 257
      const length = LENGTH_BASE[lengthIndex]! + reader.readBits(LENGTH_EXTRA[lengthIndex]!)
      const distanceSymbol = decodeSymbol(reader, distanceTable)
      if (distanceSymbol > 29) throw new Error("Ungültiger DEFLATE-Distanzcode.")
      const distance = DISTANCE_BASE[distanceSymbol]! + reader.readBits(DISTANCE_EXTRA[distanceSymbol]!)
      if (distance <= 0 || distance > written || written + length > output.length) {
        throw new Error("Ungültige DEFLATE-Rückreferenz.")
      }
      for (let index = 0; index < length; index += 1) {
        output[written] = output[written - distance]!
        written += 1
      }
    }
  }
  if (written !== output.length) throw new Error("DEFLATE-Ausgabe stimmt nicht mit der angekündigten Größe überein.")
  if (reader.remainingBits() >= 8) throw new Error("DEFLATE-Daten enthalten unerwartete nachgestellte Bytes.")
  return output
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function decodePath(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes) }
  catch { throw new Error("Ein lokaler ZIP-Pfad ist nicht gültiges UTF-8.") }
}

/** Extracts one entry only after its local header is matched to approved central metadata. */
export function extractZipEntry(archive: Uint8Array, entry: ZipEntry): Uint8Array {
  const offset = entry.localOffset
  if (u32(archive, offset) !== 0x04034b50 || offset + 30 > archive.length) {
    throw new Error(`Lokaler ZIP-Header fehlt: ${entry.path}`)
  }
  const flags = u16(archive, offset + 6)
  const method = u16(archive, offset + 8)
  const localCrc = u32(archive, offset + 14)
  const localCompressed = u32(archive, offset + 18)
  const localExpanded = u32(archive, offset + 22)
  const nameLength = u16(archive, offset + 26)
  const extraLength = u16(archive, offset + 28)
  const nameStart = offset + 30
  const dataStart = nameStart + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedBytes
  if (dataStart < nameStart || dataEnd < dataStart || dataEnd > archive.length || dataEnd > entry.centralOffset) {
    throw new Error(`ZIP-Nutzdaten liegen außerhalb ihrer Grenzen: ${entry.path}`)
  }
  const localPath = decodePath(archive.subarray(nameStart, nameStart + nameLength))
  if (localPath !== entry.path || flags !== entry.flags || method !== entry.method) {
    throw new Error(`Lokaler und zentraler ZIP-Eintrag widersprechen sich: ${entry.path}`)
  }
  if ((flags & 1) !== 0) throw new Error("Verschlüsselte ZIP-Einträge sind nicht erlaubt.")
  if ((flags & 8) === 0 && (localCrc !== entry.crc32 || localCompressed !== entry.compressedBytes ||
      localExpanded !== entry.expandedBytes)) {
    throw new Error(`Lokale ZIP-Größen oder CRC widersprechen dem Zentralverzeichnis: ${entry.path}`)
  }
  const compressed = archive.subarray(dataStart, dataEnd)
  const output = method === 0 ? new Uint8Array(compressed) : inflateRaw(compressed, entry.expandedBytes)
  if (output.length !== entry.expandedBytes || crc32(output) !== entry.crc32) {
    throw new Error(`CRC- oder Größenprüfung fehlgeschlagen: ${entry.path}`)
  }
  return output
}
