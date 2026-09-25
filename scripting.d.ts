// Minimal Scripting global types for typecheck (Non-Pro, App Store)
// Quellen: Scripting Documentation.zip — file_manager/en.md etc.

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
