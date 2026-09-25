// Native hashing (Crypto module, free tier). Never hash large buffers in JS.
// SPDX-License-Identifier: GPL-3.0-or-later

export function sha256Hex(data: Data): string {
  return Crypto.sha256(data).toHexString().toLowerCase()
}

export function sha1Hex(data: Data): string {
  return Crypto.sha1(data).toHexString().toLowerCase()
}

export async function sha256File(path: string): Promise<string> {
  return sha256Hex(await FileManager.readAsData(path))
}
