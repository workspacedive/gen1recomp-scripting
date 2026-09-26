export const RUNTIME_BRIDGE_PROTOCOL = 1 as const

export type RuntimeBridgeType =
  | "bridge.ready"
  | "resource.read"
  | "resources.ready"
  | "resources.error"
  | "player.loaded"
  | "runtime.ready"
  | "runtime.error"
  | "runtime.timeout"

export interface RuntimeBridgeMessage {
  protocolVersion: typeof RUNTIME_BRIDGE_PROTOCOL
  type: RuntimeBridgeType
  detail: string
  data: Record<string, unknown>
}

const TYPES = new Set<RuntimeBridgeType>([
  "bridge.ready", "resource.read", "resources.ready", "resources.error", "player.loaded",
  "runtime.ready", "runtime.error", "runtime.timeout",
])

export function parseRuntimeBridgeMessage(raw: unknown): RuntimeBridgeMessage | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  if (value.protocolVersion !== RUNTIME_BRIDGE_PROTOCOL || typeof value.type !== "string"
    || !TYPES.has(value.type as RuntimeBridgeType) || typeof value.detail !== "string") return null
  const data = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data as Record<string, unknown> : {}
  return {
    protocolVersion: RUNTIME_BRIDGE_PROTOCOL,
    type: value.type as RuntimeBridgeType,
    detail: value.detail,
    data,
  }
}
