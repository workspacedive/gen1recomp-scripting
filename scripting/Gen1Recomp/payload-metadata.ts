export interface PayloadVersionMetadata {
  engine: string
  payloadHost: string
  minShell: number
}

/** Parses only literal compatibility fields; it never evaluates candidate Lua. */
export function parsePayloadVersionLua(text: string, expectedEngine: string): PayloadVersionMetadata {
  const engine = text.match(/\bengine\s*=\s*"([^"]+)"/)?.[1]
  const payloadHost = text.match(/\bpayloadHost\s*=\s*"([^"]+)"/)?.[1] ?? "love"
  const minShellText = text.match(/\bminShell\s*=\s*(\d+)/)?.[1]
  const minShell = minShellText == null ? NaN : Number(minShellText)
  if (engine !== expectedEngine || payloadHost !== "love"
      || !Number.isInteger(minShell) || minShell <= 0) {
    throw new Error("Der Payload meldet unerwartete Engine-, Host- oder Shell-Metadaten.")
  }
  return { engine, payloadHost, minShell }
}
