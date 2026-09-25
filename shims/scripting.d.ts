export const VStack: any
export const HStack: any
export const Text: any
export const Button: any
export const List: any
export const Section: any
export const Navigation: any
export const Script: any
export const Canvas: any
export const Image: any
export const WebView: any
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
