/**
 * Rom — port of src/import/Rom.lua (VERIFIZIERT)
 * Bank addressing: bank 0 → 0x0000-0x3FFF, bank N>0 → 0x4000-0x7FFF window.
 * Pure TS, no love.* dependencies. Used by RomExtractor for direct ROM reads.
 */

const BANK_SIZE = 0x4000

export class Rom {
  constructor(private data: Uint8Array) {
    if (!(data instanceof Uint8Array)) throw new Error("ROM data must be Uint8Array")
  }

  static offset(bank: number, address: number): number {
    if (bank === 0) {
      if (address < 0 || address >= BANK_SIZE) throw new Error(`ROM0 address out of range: $${address.toString(16).padStart(4,"0")}`)
      return address
    }
    if (address < BANK_SIZE || address >= BANK_SIZE * 2) throw new Error(`bank ${bank.toString(16).padStart(2,"0")} address out of range: $${address.toString(16).padStart(4,"0")}`)
    return bank * BANK_SIZE + address - BANK_SIZE
  }

  byte(bank: number, address: number): number {
    const off = Rom.offset(bank, address)
    if (off < 0 || off >= this.data.length) throw new Error(`ROM read past end at ${bank.toString(16).padStart(2,"0")}:${address.toString(16).padStart(4,"0")}`)
    return this.data[off]!
  }

  word(bank: number, address: number): number {
    return this.byte(bank, address) + this.byte(bank, address + 1) * 0x100
  }

  bytes(bank: number, address: number, length: number): number[] {
    const first = Rom.offset(bank, address)
    const last = first + length - 1
    if (last >= this.data.length) throw new Error(`ROM read past end at ${bank.toString(16).padStart(2,"0")}:${address.toString(16).padStart(4,"0")} + ${length}`)
    const out: number[] = new Array(length)
    for (let i = 0; i < length; i++) out[i] = this.data[first + i]!
    return out
  }

  decodeText(raw: number[], charmap: Record<string,string>, stop = 0x50): string {
    const out: string[] = []
    for (const v of raw) {
      if (v === stop) break
      out.push(charmap[String(v)] ?? `{BYTE:${v.toString(16).padStart(2,"0").toUpperCase()}}`)
    }
    return out.join("")
  }

  readString(bank: number, address: number, charmap: Record<string,string>, stop = 0x50, maxLength = 4096): { text: string; length: number } {
    const out: string[] = []
    for (let offset = 0; offset < maxLength; offset++) {
      const v = this.byte(bank, address + offset)
      if (v === stop) return { text: out.join(""), length: offset + 1 }
      out.push(charmap[String(v)] ?? `{BYTE:${v.toString(16).padStart(2,"0").toUpperCase()}}`)
    }
    throw new Error(`unterminated string at ${bank.toString(16).padStart(2,"0")}:${address.toString(16).padStart(4,"0")}`)
  }

  static bcd(raw: number[]): number {
    let value = 0
    for (const b of raw) value = value * 100 + Math.floor(b / 16) * 10 + (b % 16)
    return value
  }

  // --- decompressPic (Gen1) --- port of Rom.decompressPic + BitReader ---
  static decompressPic(data: number[]): { raw: number[]; width: number } {
    const reader = new BitReader(data)
    const width = reader.read(4)
    const height = reader.read(4)
    if (width === 0 || width !== height) throw new Error(`compressed picture is not a non-empty square (${width}x${height})`)
    const order = reader.read(1)
    const planes: number[][] = []
    planes[order] = fillPicPlane(reader, width)
    let mode = reader.read(1)
    if (mode !== 0) mode = mode + reader.read(1)
    planes[1 - order] = fillPicPlane(reader, width)

    unfilterPicPlane(planes[order]!, width)
    if (mode !== 1) unfilterPicPlane(planes[1 - order]!, width)
    if (mode !== 0) {
      const a = planes[1 - order]!
      const b = planes[order]!
      for (let i = 0; i < width * width * 8; i++) a[i] = (a[i]! ^ b[i]!) & 0xFF
    }
    const output: number[] = []
    for (let i = 0; i < width * width * 8; i++) {
      output.push(planes[0]![i]!)
      output.push(planes[1]![i]!)
    }
    transposePicTiles(output, width)
    return { raw: output, width }
  }

  // --- decompressLz3 (Gen2) --- port of Rom.decompressLz3 ---
  static decompressLz3(data: number[] | Uint8Array): number[] {
    const bytes: number[] = data instanceof Uint8Array ? Array.from(data) : (data as number[]).slice()
    let pos = 0
    const nextByte = () => {
      const v = bytes[pos]
      if (v === undefined) throw new Error("lz3 stream ended unexpectedly")
      pos++
      return v
    }
    const out: number[] = []
    const flipBits = (v: number) => {
      let f = 0
      for (let i = 0; i < 8; i++) f += ((Math.floor(v / (2 ** i)) % 2) * (2 ** (7 - i)))
      return f
    }
    while (true) {
      const first = bytes[pos]
      if (first === undefined) throw new Error("lz3 stream ended without a terminator")
      pos++
      if (first === 0xFF) break
      let command: number, length: number
      if (Math.floor(first / 0x20) === 7) {
        command = Math.floor(first / 4) % 8
        const high = first % 4
        length = high * 0x100 + nextByte() + 1
      } else {
        command = Math.floor(first / 0x20)
        length = (first % 0x20) + 1
      }
      if (command === 0) {
        for (let i = 0; i < length; i++) out.push(nextByte())
      } else if (command === 1) {
        const v = nextByte()
        for (let i = 0; i < length; i++) out.push(v)
      } else if (command === 2) {
        const a = nextByte(), b = nextByte()
        for (let i = 0; i < length; i++) out.push(i % 2 === 0 ? a : b)
      } else if (command === 3) {
        for (let i = 0; i < length; i++) out.push(0)
      } else {
        const offsetByte = nextByte()
        let from: number
        if (offsetByte >= 0x80) from = out.length - (offsetByte % 0x80)
        else from = offsetByte * 0x100 + nextByte() + 1
        if (command === 5) {
          for (let i = 0; i < length; i++) out.push(flipBits(out[(from + i) - 1] ?? 0))
        } else if (command === 6) {
          for (let i = 0; i < length; i++) out.push(out[(from - i) - 1] ?? 0)
        } else {
          for (let i = 0; i < length; i++) out.push(out[(from + i) - 1] ?? 0)
        }
      }
    }
    return out
  }
}

class BitReader {
  private byte = 0
  private bit = 7
  constructor(private data: number[]) {}
  read(count = 1): number {
    let value = 0
    for (let i = 0; i < count; i++) {
      const b = this.data[this.byte]
      if (b === undefined) throw new Error("compressed picture ended unexpectedly")
      value = value * 2 + (Math.floor(b / (2 ** this.bit)) % 2)
      this.bit--
      if (this.bit < 0) { this.byte++; this.bit = 7 }
    }
    return value
  }
}

function fillPicPlane(reader: BitReader, width: number): number[] {
  let mode = reader.read()
  const groupCount = width * width * 0x20
  const groups: number[] = []
  while (groups.length < groupCount) {
    if (mode !== 0) {
      while (groups.length < groupCount) {
        const g = reader.read(2)
        if (g === 0) break
        groups.push(g)
      }
    } else {
      let prefix = 0
      while (reader.read() !== 0) {
        prefix++
        if (prefix >= 16) throw new Error("invalid compressed picture zero run")
      }
      const zeroCount = (2 ** (prefix + 1)) - 1 + reader.read(prefix + 1)
      for (let i = 0; i < Math.min(zeroCount, groupCount - groups.length); i++) groups.push(0)
    }
    mode = 1 - mode
  }
  const reordered: number[] = []
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width * 8; x++) {
      for (let g = 0; g < 4; g++) {
        const source = (y * 4 + g) * width * 8 + x
        reordered.push(groups[source]!)
      }
    }
  }
  const packed: number[] = []
  for (let i = 0; i < width * width * 8; i++) {
    const s = i * 4
    packed.push(reordered[s]! * 0x40 + reordered[s + 1]! * 0x10 + reordered[s + 2]! * 4 + reordered[s + 3]!)
  }
  return packed
}

const PIC_CODES: number[][] = [
  [0x0,0x1,0x3,0x2,0x7,0x6,0x4,0x5,0xF,0xE,0xC,0xD,0x8,0x9,0xB,0xA],
  [0xF,0xE,0xC,0xD,0x8,0x9,0xB,0xA,0x0,0x1,0x3,0x2,0x7,0x6,0x4,0x5],
]

function unfilterPicPlane(plane: number[], width: number) {
  for (let x = 0; x < width * 8; x++) {
    let bit = 0
    for (let y = 0; y < width; y++) {
      const idx = y * width * 8 + x
      const high = PIC_CODES[bit]![Math.floor(plane[idx]! / 16)]!
      bit = high % 2
      const low = PIC_CODES[bit]![plane[idx]! % 16]!
      bit = low % 2
      plane[idx] = high * 16 + low
    }
  }
}

function transposePicTiles(data: number[], width: number) {
  const tileCount = width * width
  for (let i = 0; i < tileCount; i++) {
    const other = (i * width + Math.floor(i / width)) % tileCount
    if (i < other) {
      for (let off = 0; off < 16; off++) {
        const left = i * 16 + off
        const right = other * 16 + off
        const tmp = data[left]!
        data[left] = data[right]!
        data[right] = tmp
      }
    }
  }
}
