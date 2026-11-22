import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyVault, vaultSchema, type Entry } from '../lib/types'
import { daysLeft, deleteForever, emptyTrash, moveToTrash, purgeExpired, restoreFromTrash, TRASH_DAYS } from '../lib/trash'
import { matchTokens, suggestLogins } from '../lib/autofill'

const at = '2026-01-01T00:00:00.000Z'
const login = (id: string, title: string, url = ''): Entry => ({ id, title, username: 'me', password: 'secret', url, notes: '', category: 'Personal', tags: [], favorite: false, createdAt: at, modifiedAt: at, passwordChangedAt: at })
const A = '7d6f2a1e-4c1b-4f7a-9a52-1f0c3b9e8d11'
const B = '0b5c2d2e-8a3f-4b6e-9f1d-2c3b4a5d6e7f'
const vault = (...entries: Entry[]) => ({ ...emptyVault(), entries })

test('older vaults without a trash still load', () => {
  const { trash: _trash, ...legacy } = vault(login(A, 'Mail'))
  assert.deepEqual(vaultSchema.parse(legacy).trash, [])
})

test('deleting moves a login to the trash and restoring brings it back unchanged', () => {
  const restoredAt = new Date('2026-02-02T00:00:00.000Z')
  const deletedAt = new Date('2026-02-01T00:00:00.000Z')
  const trashed = moveToTrash(vault(login(A, 'Mail')), A, deletedAt)
  assert.equal(trashed.entries.length, 0)
  assert.equal(trashed.trash[0].deletedAt, deletedAt.toISOString())
  assert.ok(vaultSchema.safeParse(trashed).success)
  const restored = restoreFromTrash(trashed, A, undefined, restoredAt)
  // Only the change time moves, so the restore also wins on synced devices.
  assert.deepEqual(restored.entries, [{ ...login(A, 'Mail'), modifiedAt: restoredAt.toISOString() }])
  assert.equal(restored.trash.length, 0)
})

test('restoring never overwrites a login that has the same ID again', () => {
  const trashed = moveToTrash(vault(login(A, 'Mail')), A)
  const restored = restoreFromTrash({ ...trashed, entries: [login(A, 'Other')] }, A, () => B)
  assert.deepEqual(restored.entries.map(entry => [entry.id, entry.title]), [[A, 'Other'], [B, 'Mail']])
})

test(`trashed logins are purged after ${TRASH_DAYS} days`, () => {
  const deletedAt = new Date('2026-02-01T00:00:00.000Z')
  const trashed = moveToTrash(vault(login(A, 'Mail')), A, deletedAt)
  const day = 24 * 60 * 60 * 1000
  assert.equal(daysLeft(trashed.trash[0], deletedAt.getTime()), TRASH_DAYS)
  assert.equal(daysLeft(trashed.trash[0], deletedAt.getTime() + (TRASH_DAYS - 0.5) * day), 1)
  assert.equal(purgeExpired(trashed, deletedAt.getTime() + (TRASH_DAYS - 1) * day).trash.length, 1)
  assert.equal(purgeExpired(trashed, deletedAt.getTime() + TRASH_DAYS * day).trash.length, 0)
})

test('deleting forever and emptying the trash', () => {
  const both = moveToTrash(moveToTrash(vault(login(A, 'Mail'), login(B, 'Bank')), A), B)
  assert.deepEqual(deleteForever(both, A).trash.map(item => item.id), [B])
  assert.equal(emptyTrash(both).trash.length, 0)
})

test('autofill suggests logins for the website first, including subdomains', () => {
  const entries = [login(A, 'Shop', 'https://www.example.com/login'), login(B, 'Bank', 'https://bank.test')]
  assert.deepEqual(suggestLogins(entries, { domain: 'accounts.example.com', packageName: 'com.android.chrome', appName: 'Chrome' }).map(entry => entry.title), ['Shop'])
  assert.deepEqual(suggestLogins(entries, { domain: 'evil-example.com', packageName: 'com.android.chrome', appName: 'Chrome' }), [])
})

test('autofill matches apps by the distinctive part of their package name', () => {
  assert.deepEqual(matchTokens({ domain: null, packageName: 'com.instagram.android', appName: null }), ['instagram'])
  const entries = [login(A, 'Instagram'), login(B, 'Mail')]
  assert.deepEqual(suggestLogins(entries, { domain: null, packageName: 'com.instagram.android', appName: 'Instagram' }).map(entry => entry.title), ['Instagram'])
})
