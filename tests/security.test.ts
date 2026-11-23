import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKey, encryptVault, decryptVault, newSalt, parseBackup, fromBase64, toBase64, ITERATIONS } from '../lib/crypto'
import { emptyVault, vaultSchema, type Entry } from '../lib/types'
import { IDBObjectStore } from 'fake-indexeddb'
import { openDB } from 'idb'
import { getRecord, commitRecord, wipeRecord, failAttempt, assertAttemptAllowed, resetAttempts, getAttempts } from '../lib/db'
import { DEFAULT_GENERATOR, generatePassword, generatePassphrase, passphraseBits, passwordStrength, masterPasswordProblem } from '../lib/generator'
import { getHealth } from '../lib/health'

const fixture = (): Entry => ({ id: crypto.randomUUID(), title: 'Private test account', username: 'private@example.test', password: 'a-test-secret-Never-Persist-Plain!', url: 'https://example.test', notes: 'sensitive test note', category: 'Personal', tags: ['test'], favorite: true, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), passwordChangedAt: new Date().toISOString() })

test('Argon2id / AES-GCM round-trip, non-extractability, random IVs, and authentication', async () => {
  const salt = newSalt()
  assert.equal(fromBase64(salt).length, 16)
  const key = await deriveKey('A sufficiently long test master!', salt)
  assert.equal(key.extractable, false)
  assert.deepEqual(key.algorithm, { name: 'AES-GCM', length: 256 })
  const data = emptyVault(); data.entries.push(fixture())
  const encrypted = await encryptVault(data, key)
  const second = await encryptVault(data, key)
  assert.equal(encrypted.kdf, 'Argon2id')
  assert.equal(ITERATIONS, 600_000)
  assert.notEqual(encrypted.iv, second.iv)
  assert.notEqual(encrypted.ciphertext, second.ciphertext)
  assert.deepEqual(await decryptVault(encrypted, key), data)
  assert.ok(!JSON.stringify(encrypted).includes(data.entries[0].password))
  assert.ok(!JSON.stringify(encrypted).includes(data.entries[0].title))
  const wrongKey = await deriveKey('A completely different master!', salt)
  await assert.rejects(decryptVault(encrypted, wrongKey))
  const bytes = fromBase64(encrypted.ciphertext); bytes[0] ^= 1
  await assert.rejects(decryptVault({ ...encrypted, ciphertext: toBase64(bytes) }, key))
  assert.throws(() => parseBackup(JSON.stringify({ ...encrypted, iterations: 1 })))
  assert.throws(() => parseBackup('{broken'))
  const newKey = await deriveKey('New test master password!', newSalt())
  await assert.rejects(decryptVault(encrypted, newKey))
})

test('IndexedDB stores only ciphertext; conflicting writes, backups, delays, and wipe are atomic', async () => {
  const salt = newSalt(), key = await deriveKey('Test master password only!', salt)
  const original = emptyVault(); original.entries.push(fixture())
  const envelope = await encryptVault(original, key)
  const record = await commitRecord(envelope, null)
  assert.deepEqual((await getRecord())?.envelope, envelope)
  await assert.rejects(commitRecord(envelope, null), /another tab/)
  const backup = parseBackup(JSON.stringify(envelope))
  assert.deepEqual(await decryptVault(backup, key), original)
  const candidates = await Promise.allSettled([commitRecord(await encryptVault(original, key), record.revision), commitRecord(await encryptVault(original, key), record.revision)])
  assert.equal(candidates.filter(result => result.status === 'fulfilled').length, 1)
  await assert.rejects(wipeRecord(record.revision), /another tab/)
  await failAttempt()
  await assert.rejects(assertAttemptAllowed(), /wait/)
  assert.equal((await getAttempts()).failures, 1)
  await resetAttempts(); await assertAttemptAllowed()
  const latest = await getRecord()
  await wipeRecord(latest!.revision)
  assert.equal(await getRecord(), undefined)
})

test('Oversized UTF-8 vaults, failed writes, invalid imports and concurrent edits preserve committed entries', async () => {
  const salt = newSalt(), key = await deriveKey('Data loss regression master!', salt)
  const original = emptyVault(); original.entries.push(fixture())
  const record = await commitRecord(await encryptVault(original, key), null)
  const huge = emptyVault()
  huge.entries = Array.from({ length: 260 }, () => ({ ...fixture(), notes: '漢'.repeat(20000) }))
  await assert.rejects(encryptVault(huge, key), /size limit/)
  assert.deepEqual(await getRecord(), record)
  const next = structuredClone(original); next.entries.push(fixture())
  const nextEnvelope = await encryptVault(next, key)
  const originalPut = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args) {
    const request = originalPut.apply(this, args)
    this.transaction.abort()
    return request
  }
  try { await assert.rejects(commitRecord(nextEnvelope, record.revision), { name: 'AbortError' }) }
  finally { IDBObjectStore.prototype.put = originalPut }
  assert.deepEqual(await getRecord(), record)
  assert.throws(() => parseBackup('{broken import'))
  const wrong = await deriveKey('Wrong backup password!', salt)
  await assert.rejects(decryptVault(record.envelope, wrong))
  assert.deepEqual(await getRecord(), record)
  const saved = await commitRecord(nextEnvelope, record.revision)
  await assert.rejects(commitRecord(record.envelope, record.revision), /another tab/)
  await assert.rejects(wipeRecord(record.revision), /another tab/)
  const secondConnection = await openDB('vault-private-v1', 3)
  const persisted = await secondConnection.get('vault', 'current')
  secondConnection.close()
  assert.deepEqual(await decryptVault(persisted.envelope, key), next)
  await wipeRecord(saved.revision)
})

test('New vaults use Mono while saved and legacy appearances survive encrypted backups', async () => {
  assert.equal(emptyVault().settings.appearance, 'mono')
  for (const appearance of ['classic', 'glass', 'gradient', 'midnight', 'forest', 'rose', 'mono', 'ocean', 'amber']) {
    assert.equal(vaultSchema.parse({ ...emptyVault(), settings: { ...emptyVault().settings, appearance } }).settings.appearance, appearance)
  }
  const legacy = { ...emptyVault(), settings: { autoLock: 5, clipboardTimeout: 30, theme: 'dark' } }
  assert.equal(vaultSchema.parse(legacy).settings.appearance, 'classic')
  assert.equal(vaultSchema.parse(legacy).settings.lockOnLeave, 'immediately')
  const relaxed = { ...emptyVault(), settings: { autoLock: 0, clipboardTimeout: 0, lockOnLeave: 'never', theme: 'system', appearance: 'midnight' } }
  assert.deepEqual(vaultSchema.parse(relaxed).settings, { ...relaxed.settings, clipboardTimeout: 60, lastBackupAt: null })
  assert.throws(() => vaultSchema.parse({ ...emptyVault(), settings: { ...emptyVault().settings, autoLock: 2 } }))
  const data = emptyVault(); data.settings.appearance = 'glass'
  data.entries.push({ ...fixture(), category: 'Snapchat' }, { ...fixture(), category: 'Discord' }, { ...fixture(), category: 'Instagram' })
  const salt = newSalt(), key = await deriveKey('Category compatibility master!', salt)
  assert.deepEqual(await decryptVault(parseBackup(JSON.stringify(await encryptVault(data, key))), key), data)
})

test('Generator enforces selected character sets and passphrase bounds', () => {
  const samples = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const password = generatePassword()
    assert.equal(password.length, 20)
    for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[^a-zA-Z0-9]/]) assert.match(password, pattern)
    samples.add(password)
  }
  assert.equal(samples.size, 100)
  assert.match(generatePassword({ ...DEFAULT_GENERATOR, uppercase: false, lowercase: false, symbols: false }), /^\d{20}$/)
  assert.throws(() => generatePassword({ length: 20, uppercase: false, lowercase: false, numbers: false, symbols: false }))
  assert.throws(() => generatePassword({ ...DEFAULT_GENERATOR, length: 7 }))
  assert.equal(generatePassphrase(10).split('-').length, 10)
  assert.ok(passphraseBits(10) >= 70)
  assert.equal(passwordStrength('password123456789012345').score, 1)
  assert.match(masterPasswordProblem('short') ?? '', /12 characters/)
  assert.ok(masterPasswordProblem('aaaaaaaaaaaaaaaa'))
  assert.ok(masterPasswordProblem('password12345678'))
  assert.ok(masterPasswordProblem('121212121212'))
  assert.equal(masterPasswordProblem('correct-horse-battery-staple'), null)
  assert.equal(masterPasswordProblem('Tr0ub4dor&3xample'), null)
})

test('Health detects reuse, weak passwords, and password age independently of entry edits', () => {
  const first = fixture(), second = { ...fixture(), password: first.password }
  const weak = { ...fixture(), password: '123' }
  const old = { ...fixture(), password: 'Different-unpredictable-9#', passwordChangedAt: new Date(Date.now() - 181 * 86400000).toISOString() }
  const result = getHealth([first, second, weak, old])
  assert.equal(result.reused.length, 2)
  assert.equal(result.weak.length, 1)
  assert.equal(result.old.length, 1)
  assert.equal(result.score, 0)
  assert.equal(getHealth([fixture()]).score, 100)
  assert.equal(getHealth([]).score, 0)
})

test('Argon2id is the default and legacy PBKDF2 vaults still open', async () => {
  const { ARGON2 } = await import('../lib/crypto')
  const data = emptyVault()
  const salt = newSalt(), key = await deriveKey('Argon2id default master!', salt)
  const envelope = await encryptVault(data, key)
  assert.equal(envelope.version, 2)
  assert.equal(envelope.kdf, 'Argon2id')
  assert.deepEqual(envelope.version === 2 && { memory: envelope.memory, iterations: envelope.iterations, parallelism: envelope.parallelism }, ARGON2)
  assert.deepEqual(await decryptVault(parseBackup(JSON.stringify(envelope)), await deriveKey('Argon2id default master!', salt)), data)
  await assert.rejects(decryptVault(envelope, await deriveKey('Wrong Argon2id master!!', salt)), /Incorrect master password/)

  const legacySalt = newSalt(), legacyKey = await deriveKey('Legacy PBKDF2 master!!', legacySalt, false, 'PBKDF2-SHA256')
  const legacy = await encryptVault(data, legacyKey)
  assert.equal(legacy.version, 1)
  const reopened = await deriveKey('Legacy PBKDF2 master!!', legacySalt, false, 'PBKDF2-SHA256')
  assert.deepEqual(await decryptVault(parseBackup(JSON.stringify(legacy)), reopened), data)
  assert.equal((await encryptVault(data, reopened)).version, 1)

  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, memory: 8 })), /not a supported/)
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, version: 1 })), /not a supported/)
})
