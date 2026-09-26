// Narrow compile-time contract for APIs used by this project.
// Derived from the official Scripting App Store documentation examples.
// Service APIs are injected globals; only UI/React symbols are module exports.

declare module 'scripting' {
  export const Button: any
  export const HStack: any
  export const Image: any
  export const Label: any
  export const List: any
  export const Navigation: any
  export const NavigationStack: any
  export const ProgressView: any
  export const Script: any
  export const Section: any
  export const Spacer: any
  export const TabView: any
  export const Text: any
  export const VStack: any
  export function fetch(input: string, init?: {
    headers?: Record<string, string>
    timeout?: number
    signal?: AbortSignal
    debugLabel?: string
  }): Promise<{
    ok: boolean
    status: number
    url: string
    expectedContentLength?: number
    text(): Promise<string>
    data(): Promise<ScriptingData>
  }>
  export function useEffect(effect: () => void | (() => void), dependencies: unknown[]): void
  export function useState<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void]
}

declare const createElement: (...args: any[]) => any
declare const Fragment: any

declare namespace JSX {
  interface IntrinsicAttributes { key?: string | number }
  interface IntrinsicElements { [name: string]: any }
}

interface ScriptingData {
  readonly size: number
  slice(start?: number, end?: number): ScriptingData
  toBase64String(): string
  toHexString(): string
  toUint8Array(): Uint8Array | null
}

declare const Crypto: {
  sha1(data: ScriptingData): ScriptingData
  sha256(data: ScriptingData): ScriptingData
}

declare const FileManager: {
  readonly documentsDirectory: string
  createDirectory(path: string, recursive?: boolean): Promise<void>
  exists(path: string): Promise<boolean>
  readAsData(path: string): Promise<ScriptingData>
  readAsString(path: string): Promise<string>
  writeAsData(path: string, data: ScriptingData): Promise<void>
  writeAsBytes(path: string, data: Uint8Array): Promise<void>
  writeAsString(path: string, data: string): Promise<void>
  copyFile(path: string, newPath: string): Promise<void>
  rename(path: string, newPath: string): Promise<void>
  remove(path: string): Promise<void>
  stat(path: string): Promise<{ size: number; type: string; creationDate: number; modificationDate: number }>
}

declare const Dialog: {
  confirm(options: {
    title?: string
    message: string
    cancelLabel?: string
    confirmLabel?: string
  }): Promise<boolean>
}

declare const DocumentPicker: {
  pickFiles(options?: {
    initialDirectory?: string
    types?: string[]
    shouldShowFileExtensions?: boolean
    allowsMultipleSelection?: boolean
  }): Promise<string[]>
  stopAcessingSecurityScopedResources(): void
}

declare class WebViewController {
  constructor(options?: { ephemeral?: boolean })
  loadFile(path: string, allowingReadAccessTo?: string): Promise<boolean>
  waitForLoad(): Promise<boolean>
  evaluateJavaScript<T = any>(javascript: string): Promise<T>
  addScriptMessageHandler<P = any, R = any>(name: string, handler: (params?: P) => R): Promise<void>
  present(options?: { fullscreen?: boolean; navigationTitle?: string }): Promise<void>
  dispose(): void
}
