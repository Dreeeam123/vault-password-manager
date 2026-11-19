import { z } from 'zod'
import { vaultSchema, type VaultData } from './types'

export const ITERATIONS = 600_000
const AAD = new TextEncoder().encode('Vault:v1:PBKDF2-SHA256:600000:AES-256-GCM')
const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)
export const envelopeSchema = z.object({
  format: z.literal('vault'), version: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'), iterations: z.literal(ITERATIONS),
  cipher: z.literal('AES-256-GCM'),
  salt: base64.length(24), iv: base64.length(16), ciphertext: base64.min(24).max(20_000_000),
}).strict()
export type Envelope = z.infer<typeof envelopeSchema>

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}
export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}
export function newSalt(): string { return toBase64(crypto.getRandomValues(new Uint8Array(16))) }

/**
 * `extractable` is only enabled inside the native Android app, where the key must
 * be exported once to be wrapped by the hardware Keystore for remembered sessions.
 */
export async function deriveKey(password: string, salt: string, extractable = false): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('Vault requires HTTPS or a secure local app environment for encryption.')
  if (password.length > 1024) throw new Error('Master passwords must not exceed 1024 characters.')
  const bytes = new TextEncoder().encode(password)
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey'])
    // A random per-vault 128-bit salt prevents precomputed attacks. The fixed,
    // validated work factor also prevents hostile backup files requesting huge KDFs.
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: ITERATIONS },
      material, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'],
    )
  } finally { bytes.fill(0) }
}

export async function encryptVault(data: VaultData, key: CryptoKey, salt: string): Promise<Envelope> {
  const validated = vaultSchema.parse(data)
  // GCM MUST get a fresh, cryptographically random 96-bit IV for every write.
  // The authentication tag protects the entire payload; AAD binds the format.
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(validated))
  try {
    // Reserve room for the GCM tag and envelope. Never persist a vault that our
    // unlock or backup parser would reject later, including multi-byte text.
    if (4 * Math.ceil((plaintext.byteLength + 16) / 3) + 1024 > 20_000_000) {
      throw new Error('Vault size limit reached. This change was not saved; your previous vault is intact. Reduce large notes or entries and try again.')
    }
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, plaintext)
    return { format: 'vault', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM', salt, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
  } finally { plaintext.fill(0) }
}

export async function decryptVault(input: unknown, key: CryptoKey): Promise<VaultData> {
  const envelope = envelopeSchema.parse(input)
  if (fromBase64(envelope.salt).length !== 16 || fromBase64(envelope.iv).length !== 12) throw new Error('Invalid backup parameters.')
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: AAD, tagLength: 128 }, key, fromBase64(envelope.ciphertext))
  } catch { throw new Error('Incorrect master password, or the vault file is damaged.') }
  try { return vaultSchema.parse(JSON.parse(new TextDecoder().decode(plaintext))) }
  finally { new Uint8Array(plaintext).fill(0) }
  // CryptoKeys are non-extractable on the web. JS strings/objects cannot be reliably zeroed;
  // locking drops references and unmounts every component containing plaintext.
}

export function parseBackup(text: string): Envelope {
  if (text.length > 20_000_000) throw new Error('Backup is too large (maximum 20 MB).')
  try { return envelopeSchema.parse(JSON.parse(text)) }
  catch { throw new Error('This is not a supported Vault encrypted backup.') }
}
