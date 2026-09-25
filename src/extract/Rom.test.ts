import { describe, it, expect } from "vitest"
import { Rom } from "./Rom"

describe("Rom", () => {
  it("byte/word offset", () => {
    const data = new Uint8Array(0x8000)
    data[0x123] = 0xAB
    data[0x4000] = 0x11
    data[0x4001] = 0x22
    const rom = new Rom(data)
    expect(rom.byte(0, 0x0123)).toBe(0xAB)
    expect(rom.byte(1, 0x4000)).toBe(0x11)
    expect(rom.word(1, 0x4000)).toBe(0x2211)
  })
  it("bcd", () => {
    expect(Rom.bcd([0x12, 0x34])).toBe(1234)
  })
  it("decodeText charmap", () => {
    const r = new Rom(new Uint8Array(0x4000))
    const raw = [0x80, 0x81, 0x50, 0x00]
    const cmap = { "128": "A", "129": "B" }
    expect(r.decodeText(raw, cmap)).toBe("AB")
  })
  it("offset validation", () => {
    expect(() => Rom.offset(0, 0x4000)).toThrow()
    expect(() => Rom.offset(1, 0x3000)).toThrow()
    expect(Rom.offset(2, 0x4000)).toBe(0x8000)
  })
  it("decompressLz3 simple literal", () => {
    // 0x00 = literal len 1, then byte 0x42, then 0xFF terminator
    const out = Rom.decompressLz3([0x00, 0x42, 0xFF])
    expect(out).toEqual([0x42])
  })
})
