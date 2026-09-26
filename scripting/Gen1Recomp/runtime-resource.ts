import type { RuntimeBridgeMessage } from "./runtime-bridge.js"

export const RUNTIME_RESOURCE_CHUNK_BYTES = 128 * 1024

export const BRIDGED_RUNTIME_PATHS = Object.freeze([
  "nogame.love",
  "lua/normalize1.lua",
  "lua/normalize2.lua",
  "11.5/love.wasm",
] as const)

export type BridgedRuntimePath = typeof BRIDGED_RUNTIME_PATHS[number]

export interface RuntimeResourceRequest {
  path: BridgedRuntimePath
  offset: number
  length: number
}

export function parseRuntimeResourceRequest(message: RuntimeBridgeMessage): RuntimeResourceRequest | null {
  if (message.type !== "resource.read") return null
  const { path, offset, length } = message.data
  if (typeof path !== "string" || !BRIDGED_RUNTIME_PATHS.includes(path as BridgedRuntimePath)
    || !Number.isInteger(offset) || (offset as number) < 0
    || !Number.isInteger(length) || (length as number) < 1
    || (length as number) > RUNTIME_RESOURCE_CHUNK_BYTES) return null
  return { path: path as BridgedRuntimePath, offset: offset as number, length: length as number }
}
