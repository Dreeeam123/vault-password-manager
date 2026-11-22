import { Capacitor, registerPlugin } from '@capacitor/core'

type SyncHost = {
  status(): Promise<{ name: string | null }>
  choose(options: { create: boolean }): Promise<{ cancelled: boolean; name?: string }>
  read(): Promise<{ text: string | null }>
  write(options: { data: string }): Promise<void>
  clear(): Promise<void>
}

declare global {
  interface Window { vaultSync?: Readonly<SyncHost> }
}

const AndroidSync = registerPlugin<SyncHost>('SyncFile')

/** The sync file lives wherever the user put it; the app can only reach that one file. */
function host(): SyncHost | null {
  if (Capacitor.getPlatform() === 'android') return AndroidSync
  if (typeof window !== 'undefined' && window.vaultSync) return window.vaultSync
  return null
}

export const syncSupported = () => host() !== null
export const SYNC_KEY = 'vault-sync-file'

export async function syncFileName() {
  const current = host()
  return current ? (await current.status()).name : null
}
export async function chooseSyncFile(create: boolean) {
  const current = host()
  if (!current) throw new Error('Sync is available in the Android and Windows apps.')
  return current.choose({ create })
}
export async function readSyncFile() {
  const text = (await host()!.read()).text
  return text && text.trim() ? text : null
}
export const writeSyncFile = (data: string) => host()!.write({ data })
export const forgetSyncFile = () => host()?.clear() ?? Promise.resolve()

export class SyncPasswordNeeded extends Error {
  constructor() { super('This sync file is protected by a different master password.') }
}
