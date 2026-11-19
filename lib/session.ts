import { Capacitor, registerPlugin } from '@capacitor/core'
import { fromBase64, toBase64 } from './crypto'
import { deleteStoredSession } from './db'

type SessionKeyPlugin = {
  store(options: { key: string; expiresAt: number | null }): Promise<void>
  touch(options: { expiresAt: number | null }): Promise<void>
  load(): Promise<{ key: string | null }>
  clear(): Promise<void>
}

const SessionKey = registerPlugin<SessionKeyPlugin>('SessionKey')
const AES = { name: 'AES-GCM', length: 256 } as const
const nativeStore = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SessionKey')

// A delayed key export/store must finish BEFORE a subsequent lock clears it.
let operations: Promise<unknown> = Promise.resolve()
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation)
  operations = next.catch(() => undefined)
  return next
}

// Only Android has an OS-backed wrapping key. A non-extractable CryptoKey in
// IndexedDB still permits decryption and must not be saved beside the ciphertext.
export function rememberSession(key: CryptoKey, expiresAt: number | null) {
  return ordered(async () => {
    await deleteStoredSession()
    if (!nativeStore() || !key.extractable) return
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    try { await SessionKey.store({ key: toBase64(raw), expiresAt }) } finally { raw.fill(0) }
  })
}

export function touchSession(expiresAt: number | null) {
  return ordered(async () => {
    if (nativeStore()) await SessionKey.touch({ expiresAt })
  })
}

export function loadSession(): Promise<CryptoKey | null> {
  return ordered(async () => {
    // Remove keys saved by older web/Windows versions without using them.
    await deleteStoredSession()
    if (!nativeStore()) return null
    const { key } = await SessionKey.load()
    if (!key) return null
    const raw = fromBase64(key)
    try { return await crypto.subtle.importKey('raw', raw, AES, true, ['encrypt', 'decrypt']) } finally { raw.fill(0) }
  })
}

export function forgetSession() {
  return ordered(async () => {
    await deleteStoredSession()
    if (nativeStore()) await SessionKey.clear()
  })
}
