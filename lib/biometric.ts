import { Capacitor, registerPlugin } from '@capacitor/core'
import { fromBase64, toBase64 } from './crypto'

type BiometricPlugin = {
  status(): Promise<{ available: boolean; enabled: boolean }>
  enable(options: { key: string }): Promise<void>
  unlock(): Promise<{ key: string }>
  disable(): Promise<void>
}

const Biometric = registerPlugin<BiometricPlugin>('Biometric')
const AES = { name: 'AES-GCM', length: 256 } as const
export const BIOMETRIC_KEY = 'biometric-status'
export type BiometricStatus = { available: boolean; enabled: boolean }

export const biometricSupported = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Biometric')

export async function biometricStatus(): Promise<BiometricStatus> {
  if (!biometricSupported()) return { available: false, enabled: false }
  return Biometric.status().catch(() => ({ available: false, enabled: false }))
}

/** The prompt was dismissed by the user; not an error worth showing. */
export const biometricCancelled = (error: unknown) => (error as { code?: string } | null)?.code === 'CANCELLED'

/**
 * Wraps the vault key with an Android Keystore key that can only be used after a
 * successful strong biometric check. Adding a new fingerprint invalidates it.
 */
export async function enableBiometric(key: CryptoKey) {
  if (!biometricSupported()) throw new Error('Fingerprint unlock is only available in the Android app.')
  if (!key.extractable) throw new Error('Unlock with your master password once, then try again.')
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  try { await Biometric.enable({ key: toBase64(raw) }) } finally { raw.fill(0) }
}

export async function unlockWithBiometric(): Promise<CryptoKey> {
  const { key } = await Biometric.unlock()
  const raw = fromBase64(key)
  try { return await crypto.subtle.importKey('raw', raw, AES, true, ['encrypt', 'decrypt']) } finally { raw.fill(0) }
}

export async function disableBiometric() {
  if (biometricSupported()) await Biometric.disable().catch(() => undefined)
}
