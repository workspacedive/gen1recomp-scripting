// Minimal Scripting types (Non-Pro, App Store) — VERIFIZIERT gegen Scripting Documentation.zip
// Quellen: document_picker/en.md (DocumentPicker.pickFiles etc.), file_manager/en.md, scripting/index.tsx imports
// Modul-Shim für `import { … } from "scripting"` + JSX Runtime — vermeidet TS2307/TS2875 bei `jsx: react-jsx` / `jsxImportSource: "scripting"`

declare module "scripting" {
  export const VStack: any
  export const HStack: any
  export const Text: any
  export const Button: any
  export const List: any
  export const Section: any
  export const Navigation: any
  export const Script: any
  export const DocumentPicker: {
    pickFiles(options?: { types?: string[]; allowsMultipleSelection?: boolean; initialDirectory?: string; shouldShowFileExtensions?: boolean }): Promise<string[] | null>
    pickDirectory(initialDirectory?: string): Promise<string | null>
    pickFileBookmark(options?: any): Promise<any>
    pickDirectoryBookmark(options?: any): Promise<any>
    exportFiles(options: any): Promise<string[]>
    stopAcessingSecurityScopedResources(): void
  }
  export const FileManager: any
  export const Storage: any
  export const Thread: any
  export const Data: any
  export const AppEvents: any
  export function useState<T>(initial: T): [T, (v: T | ((p: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void
}

declare module "scripting/jsx-runtime" {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
}

declare global {
  const FileManager: any
  const Storage: any
  const Thread: any
  const DocumentPicker: any
  const Navigation: any
  const Script: any
  const Data: any
  const AppEvents: any
  type Data = any
  type RequestInit = any
  type Response = any
  type Request = any
  type Headers = any
  type FormData = any
  type AbortSignal = any
  type AbortController = any
}
export {}
