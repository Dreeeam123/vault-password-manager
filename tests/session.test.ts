import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKey, encryptVault, decryptVault, newSalt } from '../lib/crypto'
import { emptyVault } from '../lib/types'
import { commitRecord, getStoredSession, putStoredSession, getRecord, wipeRecord } from '../lib/db'
import { forgetSession, loadSession, rememberSession, touchSession } from '../lib/session'

test('Web/desktop remove legacy saved keys without changing the encrypted vault', async () => {
  const salt = newSalt(), key = await deriveKey('Remembered session master pw!', salt)
  const record = await commitRecord(await encryptVault(emptyVault(), key, salt), null)
  await putStoredSession({ key, expiresAt: null })
  assert.ok(await getStoredSession())
  assert.equal(await loadSession(), null, 'never automatically use a legacy unwrapped key')
  assert.equal(await getStoredSession(), null, 'legacy key is removed')
  assert.deepEqual(await getRecord(), record, 'ciphertext remains intact')
  assert.deepEqual(await decryptVault(record.envelope, key), emptyVault())
  await rememberSession(key, null)
  await touchSession(Date.now() + 60_000)
  assert.equal(await getStoredSession(), null, 'new browser sessions never write keys to disk')
  assert.equal(await loadSession(), null, 'relaunch requires the master password')
  await Promise.all([rememberSession(key, null), forgetSession()])
  assert.equal(await getStoredSession(), null, 'lock wins over an in-flight remember operation')
  await wipeRecord(record.revision)
})
