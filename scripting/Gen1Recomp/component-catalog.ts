import { fetch } from "scripting"
import { APP } from "./config"
import { PATHS } from "./host"

export const COMPONENTS = Object.freeze({
  hostProject: {
    id: "scripting-host",
    version: APP.version,
    updateMode: "reimport-scripting",
  },
  gen1recomp: {
    id: "gen1recomp-payload",
    version: "0.3.20",
    sourceRevision: "64dd9cb3a377b398b6132d223a121878f68b4b07",
    payloadSha256: "c0da7035afb110cb9b45556a44c855bd27c96903737128fa8114209b9eb7f0a5",
    payloadHost: "love",
    updateMode: "staged-payload",
  },
  lovejs: {
    id: "lovejs-runtime",
    runtimeId: "lovejs-11.5-r13",
    loveVersion: "11.5",
    adapterVersion: 13,
    bridgeProtocol: 1,
    sourceRevision: "9355186de22db13bd88bf2a0db75d2925647d036",
    javascriptSha256: "34b300f06ecb44d92edb1183c11a38c1cc324ba10a9f7af96b8efa1d1df15147",
    wasmSha256: "304f195f36d163f3bb2127e7c232fd1fd0791ee2ab61ba003d47096003b53bf1",
    updateMode: "reviewed-side-by-side-runtime",
  },
})

const RELEASE_API = "https://api.github.com/repos/bryanthaboi/gen1recomp/releases/latest"
const RELEASE_PAGE = "https://github.com/bryanthaboi/gen1recomp/releases/latest"
const STATUS_PATH = `${PATHS.diagnostics}/release-status.v1.json`

export interface UpstreamReleaseStatus {
  checkedAt: string
  currentVersion: string
  latestVersion: string
  releasePage: string
  payloadName?: string
  payloadSha256?: string
  sumsPresent: boolean
  state: "current" | "available" | "metadata-incomplete" | "unknown-version"
}

interface GithubAsset { name?: unknown; digest?: unknown }
interface GithubRelease { tag_name?: unknown; html_url?: unknown; assets?: unknown }

function isReleaseStatus(value: unknown): value is UpstreamReleaseStatus {
  if (!value || typeof value !== "object") return false
  const status = value as Partial<UpstreamReleaseStatus>
  return typeof status.checkedAt === "string" && typeof status.currentVersion === "string"
    && typeof status.latestVersion === "string" && typeof status.releasePage === "string"
    && typeof status.sumsPresent === "boolean"
    && (status.state === "current" || status.state === "available"
      || status.state === "metadata-incomplete" || status.state === "unknown-version")
    && (status.payloadName == null || typeof status.payloadName === "string")
    && (status.payloadSha256 == null || (typeof status.payloadSha256 === "string"
      && /^[0-9a-f]{64}$/.test(status.payloadSha256)))
}

export async function loadCachedReleaseStatus(): Promise<UpstreamReleaseStatus | null> {
  if (!(await FileManager.exists(STATUS_PATH))) return null
  try {
    const value = JSON.parse(await FileManager.readAsString(STATUS_PATH)) as unknown
    return isReleaseStatus(value) ? value : null
  } catch { return null }
}

async function saveReleaseStatus(status: UpstreamReleaseStatus): Promise<void> {
  const temporary = `${STATUS_PATH}.tmp`
  await FileManager.writeAsString(temporary, JSON.stringify(status, null, 2))
  if (await FileManager.exists(STATUS_PATH)) await FileManager.remove(STATUS_PATH)
  await FileManager.rename(temporary, STATUS_PATH)
}

function semver(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function newer(left: [number, number, number], right: [number, number, number]): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index]
  }
  return false
}

export async function checkUpstreamRelease(): Promise<UpstreamReleaseStatus> {
  const response = await fetch(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    timeout: 20,
    debugLabel: "Gen1Recomp release metadata",
  })
  if (!response.ok) throw new Error(`GitHub antwortete mit HTTP ${response.status}.`)
  if (response.expectedContentLength != null && response.expectedContentLength > 1024 * 1024) {
    throw new Error("Die Release-Antwort ist unerwartet groß.")
  }
  const text = await response.text()
  if (text.length > 1024 * 1024) throw new Error("Die Release-Antwort ist unerwartet groß.")
  const release = JSON.parse(text) as GithubRelease
  if (typeof release.tag_name !== "string" || !Array.isArray(release.assets)) {
    throw new Error("GitHub lieferte unerwartete Release-Metadaten.")
  }
  const version = semver(release.tag_name)
  const assets = (release.assets as GithubAsset[]).filter((asset) => typeof asset.name === "string")
  const payloadName = `gen1recomp-${release.tag_name.replace(/^v/, "")}.love`
  const payload = assets.find((asset) => asset.name === payloadName)
  const sumsPresent = assets.some((asset) => asset.name === "sha256sums.txt")
  const digest = typeof payload?.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(payload.digest)
    ? payload.digest.slice(7).toLowerCase() : undefined
  const current = semver(COMPONENTS.gen1recomp.version)
  let state: UpstreamReleaseStatus["state"] = "unknown-version"
  if (version && current) {
    if (!payload || !digest || !sumsPresent) state = "metadata-incomplete"
    else state = newer(version, current) ? "available" : "current"
  }
  const result: UpstreamReleaseStatus = {
    checkedAt: new Date().toISOString(), currentVersion: COMPONENTS.gen1recomp.version,
    latestVersion: release.tag_name.replace(/^v/, ""),
    releasePage: typeof release.html_url === "string" ? release.html_url : RELEASE_PAGE,
    payloadName: payload ? payloadName : undefined, payloadSha256: digest, sumsPresent, state,
  }
  await saveReleaseStatus(result)
  return result
}
