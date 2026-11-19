import { openDB, type DBSchema } from 'idb'
import type { Envelope } from './crypto'

export type VaultRecord = { revision: string; envelope: Envelope }
export type Attempts = { failures: number; blockedUntil: number }
export type StoredSession = { key: CryptoKey; expiresAt: number | null }
/** Theme choices are not secret; kept outside the encrypted vault so the lock screen can use them. */
export type StoredLook = { theme: 'dark' | 'light' | 'system'; appearance: string }
interface VaultDB extends DBSchema {
  vault: { key: string; value: VaultRecord }
  meta: { key: string; value: Attempts }
  session: { key: string; value: StoredSession }
  look: { key: string; value: StoredLook }
}
let database: ReturnType<typeof openDB<VaultDB>> | undefined
const STORAGE_WAIT_MS = 10_000
const storageTimeout = () => new Error('Local storage did not respond. Close other Vault tabs and try again. Do not clear your browser data.')

function db() {
  if (database) return database
  let expired = false
  let timer: ReturnType<typeof setTimeout>
  const opening = openDB<VaultDB>('vault-private-v1', 3, {
    upgrade(connection) {
      if (!connection.objectStoreNames.contains('vault')) connection.createObjectStore('vault')
      if (!connection.objectStoreNames.contains('meta')) connection.createObjectStore('meta')
      if (!connection.objectStoreNames.contains('session')) connection.createObjectStore('session')
      if (!connection.objectStoreNames.contains('look')) connection.createObjectStore('look')
    },
    blocking() {
      void opening.then(connection => connection.close())
      if (database === attempt) database = undefined
    },
    terminated() { if (database === attempt) database = undefined },
  })
  // An IndexedDB open cannot be cancelled; close a late result rather than reusing it.
  void opening.then(connection => { if (expired) connection.close() }, () => {})
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(storageTimeout()) }, STORAGE_WAIT_MS)
  })
  const attempt = Promise.race([opening, deadline]).catch(error => {
    if (database === attempt) database = undefined
    throw error
  }).finally(() => clearTimeout(timer))
  database = attempt
  return attempt
}
export async function getRecord() {
  const attempt = db()
  const connection = await attempt
  const transaction = connection.transaction('vault', 'readonly')
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(storageTimeout())
      try { transaction.abort() } catch { /* The browser may already have ended the transaction. */ }
      connection.close()
      if (database === attempt) database = undefined
    }, STORAGE_WAIT_MS)
  })
  try {
    const [record] = await Promise.race([
      Promise.all([transaction.store.get('current'), transaction.done]),
      deadline,
    ])
    return record
  } finally { clearTimeout(timer!) }
}
export async function getAttempts(): Promise<Attempts> {
  return (await (await db()).get('meta', 'attempts')) ?? { failures: 0, blockedUntil: 0 }
}
export async function assertAttemptAllowed() {
  const attempts = await getAttempts()
  if (Date.now() < attempts.blockedUntil) throw new Error(`Please wait ${Math.ceil((attempts.blockedUntil - Date.now()) / 1000)} seconds before trying again.`)
}
export async function failAttempt() {
  const transaction = (await db()).transaction('meta', 'readwrite')
  const previous = await transaction.store.get('attempts')
  const failures = Math.min((previous?.failures ?? 0) + 1, 20)
  const delay = Math.min(300, 2 ** failures)
  await transaction.store.put({ failures, blockedUntil: Date.now() + delay * 1000 }, 'attempts')
  await transaction.done
  return delay
}
export async function resetAttempts() { await (await db()).put('meta', { failures: 0, blockedUntil: 0 }, 'attempts') }
export async function getLook(): Promise<StoredLook | undefined> {
  try { return await (await db()).get('look', 'current') } catch { return undefined }
}
export async function saveLook(look: StoredLook) {
  try { await (await db()).put('look', look, 'current') } catch { /* cosmetic only; never block a vault write */ }
}
export async function clearLook() {
  try { await (await db()).delete('look', 'current') } catch { /* cosmetic only */ }
}

export async function commitRecord(envelope: Envelope, expectedRevision: string | null): Promise<VaultRecord> {
  const transaction = (await db()).transaction('vault', 'readwrite', { durability: 'strict' })
  const current = await transaction.store.get('current')
  if ((current?.revision ?? null) !== expectedRevision) {
    await transaction.done
    throw new Error('The vault changed in another tab. Lock and unlock before trying again.')
  }
  const next = { revision: crypto.randomUUID(), envelope }
  // Observe both request and transaction failure, including quota/abort errors.
  // IndexedDB rolls back the entire transaction; the prior record remains intact.
  await Promise.all([transaction.store.put(next, 'current'), transaction.done])
  return next
}
export async function wipeRecord(expectedRevision: string) {
  const transaction = (await db()).transaction(['vault', 'meta', 'session', 'look'], 'readwrite')
  const current = await transaction.objectStore('vault').get('current')
  if (current?.revision !== expectedRevision) { await transaction.done; throw new Error('Vault changed in another tab. Unlock it again before erasing.') }
  await transaction.objectStore('vault').clear()
  await transaction.objectStore('meta').clear()
  await transaction.objectStore('session').clear()
  await transaction.objectStore('look').clear()
  await transaction.done
}

export async function getStoredSession() { return (await (await db()).get('session', 'current')) ?? null }
export async function putStoredSession(session: StoredSession) { await (await db()).put('session', session, 'current') }
export async function deleteStoredSession() { await (await db()).delete('session', 'current') }
export async function touchStoredSession(expiresAt: number | null) {
  const transaction = (await db()).transaction('session', 'readwrite')
  const current = await transaction.store.get('current')
  if (current) await transaction.store.put({ ...current, expiresAt }, 'current')
  await transaction.done
}
