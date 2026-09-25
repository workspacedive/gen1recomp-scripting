// Safe reader for the gen1recomp save/options format (SaveSerializer.encode):
//   return <value>
//   value := nil | true | false | number | "%q string" | '{' fields '}'
//   field := name '=' value | '[' value ']' '=' value | value
// It never executes anything; unknown syntax is a parse error. Mirrors the
// restricted-grammar reader in src/core/SaveSerializer.lua, which exists so a
// tampered save fails to parse instead of executing.
// SPDX-License-Identifier: GPL-3.0-or-later

export type LuaValue = null | boolean | number | string | LuaTable
export interface LuaTable { [key: string]: LuaValue }

const MAX_DEPTH = 64

export function parseLuaReturn(src: string): LuaValue {
  let i = 0
  const n = src.length

  const fail = (msg: string): never => { throw new Error(`lua table parse error at ${i}: ${msg}`) }
  const ws = () => {
    while (i < n) {
      const c = src[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
      if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue }
      break
    }
  }
  const expect = (s: string) => { ws(); if (src.startsWith(s, i)) { i += s.length } else fail(`expected ${s}`) }

  const str = (): string => {
    const q = src[i++]
    let out = ''
    while (i < n) {
      const c = src[i++]
      if (c === q) return out
      if (c === '\n') fail('newline in string')
      if (c !== '\\') { out += c; continue }
      const e = src[i++]
      if (e === 'n') out += '\n'
      else if (e === 't') out += '\t'
      else if (e === 'r') out += '\r'
      else if (e === 'a') out += '\x07'
      else if (e === 'b') out += '\b'
      else if (e === 'f') out += '\f'
      else if (e === 'v') out += '\v'
      else if (e === '\\' || e === '"' || e === "'") out += e
      else if (e === '\n') out += '\n'
      else if (e === '\r') { out += '\n'; if (src[i] === '\n') i++ }
      else if (e >= '0' && e <= '9') {
        let d = e
        while (d.length < 3 && src[i] >= '0' && src[i] <= '9') d += src[i++]
        const v = parseInt(d, 10)
        if (v > 255) fail('escape too large')
        out += String.fromCharCode(v)
      } else fail('bad escape')
    }
    return fail('unterminated string')
  }

  const num = (): number => {
    const m = /^-?(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|inf|nan)/.exec(src.slice(i, i + 64))
    if (!m) return fail('bad number')
    i += m[0].length
    const t = m[0]
    if (/inf$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity
    if (/nan$/.test(t)) return NaN
    return Number(t)
  }

  const value = (depth: number): LuaValue => {
    if (depth > MAX_DEPTH) fail('nesting too deep')
    ws()
    const c = src[i]
    if (c === '{') return table(depth + 1)
    if (c === '"' || c === "'") return str()
    if (src.startsWith('true', i)) { i += 4; return true }
    if (src.startsWith('false', i)) { i += 5; return false }
    if (src.startsWith('nil', i)) { i += 3; return null }
    if (c === '-' && src[i + 1] === '(') fail('expressions are not allowed')
    if ((c >= '0' && c <= '9') || c === '-' || c === '.') return num()
    if (src.startsWith('(0/0)', i) || src.startsWith('(-0/0)', i)) { i = src.indexOf(')', i) + 1; return NaN }
    if (src.startsWith('(1/0)', i)) { i += 5; return Infinity }
    if (src.startsWith('(-1/0)', i)) { i += 6; return -Infinity }
    return fail('unexpected token')
  }

  const keyString = (k: LuaValue): string => (typeof k === 'number' ? String(k) : String(k))

  const table = (depth: number): LuaTable => {
    expect('{')
    const t: LuaTable = {}
    let arrayIndex = 1
    while (true) {
      ws()
      if (src[i] === '}') { i++; return t }
      if (src[i] === '[') {
        i++
        const k = value(depth)
        expect(']')
        expect('=')
        t[keyString(k)] = value(depth)
      } else {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 256))
        let handled = false
        if (m) {
          const save = i
          i += m[0].length
          ws()
          if (src[i] === '=' && src[i + 1] !== '=') {
            i++
            t[m[0]] = value(depth)
            handled = true
          } else {
            i = save
          }
        }
        if (!handled) t[String(arrayIndex++)] = value(depth)
      }
      ws()
      if (src[i] === ',' || src[i] === ';') { i++; continue }
      ws()
      if (src[i] === '}') { i++; return t }
      fail('expected , or }')
    }
  }

  ws()
  if (src.startsWith('return', i)) i += 6
  else fail('expected return')
  const v = value(0)
  ws()
  if (i < n) fail('trailing content')
  return v
}
