import { argon2id } from 'hash-wasm'
import { z } from 'zod'
import { vaultSchema, type VaultData } from './types'

/** Legacy (version 1) key derivation. Still read so older vaults and backups open and get upgraded. */
export const ITERATIONS = 600_000
/** Current (version 2) key derivation: Argon2id per RFC 9106's second recommended option. */
export const ARGON2 = { memory: 65_536, iterations: 3, parallelism: 4 } as const

export type Kdf = 'Argon2id' | 'PBKDF2-SHA256'
export const CURRENT_KDF: Kdf = 'Argon2id'

const AAD = {
  1: new TextEncoder().encode('Vault:v1:PBKDF2-SHA256:600000:AES-256-GCM'),
  2: new TextEncoder().encode('Vault:v2:Argon2id:m=65536,t=3,p=4:AES-256-GCM'),
} as const

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)
const payload = {
  cipher: z.literal('AES-256-GCM'),
  salt: base64.length(24), iv: base64.length(16), ciphertext: base64.min(24).max(20_000_000),
}
// Every work factor is a fixed literal, so a hostile backup file can never request a weak or huge KDF.
const legacyEnvelope = z.object({
  format: z.literal('vault'), version: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'), iterations: z.literal(ITERATIONS),
  ...payload,
}).strict()
const argonEnvelope = z.object({
  format: z.literal('vault'), version: z.literal(2),
  kdf: z.literal('Argon2id'),
  memory: z.literal(ARGON2.memory), iterations: z.literal(ARGON2.iterations), parallelism: z.literal(ARGON2.parallelism),
  ...payload,
}).strict()
export const envelopeSchema = z.discriminatedUnion('version', [legacyEnvelope, argonEnvelope])
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
 * Remembers which KDF and salt produced each key, so a write always describes the key that
 * actually encrypted it. Keys restored from the Android Keystore are bound on their first
 * successful decrypt, which proves they belong to that envelope.
 */
const keyParams = new WeakMap<CryptoKey, { kdf: Kdf; salt: string }>()

/**
 * `extractable` is only enabled inside the native Android app, where the key must
 * be exported once to be wrapped by the hardware Keystore for remembered sessions.
 */
export async function deriveKey(password: string, salt: string, extractable = false, kdf: Kdf = CURRENT_KDF): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('Vault requires HTTPS or a secure local app environment for encryption.')
  if (password.length > 1024) throw new Error('Master passwords must not exceed 1024 characters.')
  const bytes = new TextEncoder().encode(password)
  try {
    const key = kdf === 'Argon2id' ? await deriveArgon2(bytes, salt, extractable) : await derivePbkdf2(bytes, salt, extractable)
    keyParams.set(key, { kdf, salt })
    return key
  } finally { bytes.fill(0) }
}

async function deriveArgon2(password: Uint8Array, salt: string, extractable: boolean) {
  const raw = await argon2id({
    password, salt: fromBase64(salt),
    memorySize: ARGON2.memory, iterations: ARGON2.iterations, parallelism: ARGON2.parallelism,
    hashLength: 32, outputType: 'binary',
  })
  try { return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']) }
  finally { raw.fill(0) }
}

async function derivePbkdf2(password: Uint8Array, salt: string, extractable: boolean) {
  const material = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: ITERATIONS },
    material, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'],
  )
}

export async function encryptVault(data: VaultData, key: CryptoKey): Promise<Envelope> {
  const params = keyParams.get(key)
  if (!params) throw new Error('Unknown vault key. Lock and unlock your vault, then try again.')
  const validated = vaultSchema.parse(data)
  // GCM MUST get a fresh, cryptographically random 96-bit IV for every write.
  // The authentication tag protects the entire payload; AAD binds the format.
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(validated))
  const version = params.kdf === 'Argon2id' ? 2 : 1
  try {
    // Reserve room for the GCM tag and envelope. Never persist a vault that our
    // unlock or backup parser would reject later, including multi-byte text.
    if (4 * Math.ceil((plaintext.byteLength + 16) / 3) + 1024 > 20_000_000) {
      throw new Error('Vault size limit reached. This change was not saved; your previous vault is intact. Reduce large notes or entries and try again.')
    }
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD[version], tagLength: 128 }, key, plaintext)
    const body = { cipher: 'AES-256-GCM' as const, salt: params.salt, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
    return version === 2
      ? { format: 'vault', version: 2, kdf: 'Argon2id', ...ARGON2, ...body }
      : { format: 'vault', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, ...body }
  } finally { plaintext.fill(0) }
}

export async function decryptVault(input: unknown, key: CryptoKey): Promise<VaultData> {
  const envelope = envelopeSchema.parse(input)
  if (fromBase64(envelope.salt).length !== 16 || fromBase64(envelope.iv).length !== 12) throw new Error('Invalid backup parameters.')
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: AAD[envelope.version], tagLength: 128 }, key, fromBase64(envelope.ciphertext))
  } catch { throw new Error('Incorrect master password, or the vault file is damaged.') }
  keyParams.set(key, { kdf: envelope.kdf, salt: envelope.salt })
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
