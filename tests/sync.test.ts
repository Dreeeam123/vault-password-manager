import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeVaults, sameContent } from '../lib/sync'
import { deleteForever, emptyTrash, moveToTrash, restoreFromTrash } from '../lib/trash'
import { emptyVault, vaultSchema, type Entry, type VaultData } from '../lib/types'

const at = (minute: number) => new Date(Date.UTC(2026, 10, 22, 10, minute)).toISOString()
const entry = (id: string, title: string, minute: number): Entry => ({
  id, title, username: '', password: 'x', url: '', notes: '', category: 'Other', tags: [], favorite: false,
  createdAt: at(0), modifiedAt: at(minute), passwordChangedAt: at(0),
})
const ID = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const vault = (entries: Entry[], extra: Partial<VaultData> = {}): VaultData => ({ ...emptyVault(), entries, ...extra })
const now = Date.parse(at(59))

test('logins added on different devices are combined', () => {
  const merged = mergeVaults(vault([entry(ID[0], 'Mail', 1)]), vault([entry(ID[1], 'Bank', 2)]), now)
  assert.deepEqual(merged.entries.map(e => e.title), ['Mail', 'Bank'])
})

test('the newer edit of the same login wins', () => {
  const merged = mergeVaults(vault([entry(ID[0], 'Old', 1)]), vault([entry(ID[0], 'New', 5)]), now)
  assert.equal(merged.entries[0].title, 'New')
  assert.equal(mergeVaults(vault([entry(ID[0], 'New', 5)]), vault([entry(ID[0], 'Old', 1)]), now).entries[0].title, 'New')
})

test('a login moved to the trash on one device is trashed everywhere', () => {
  const other = moveToTrash(vault([entry(ID[0], 'Mail', 1)]), ID[0], new Date(at(3)))
  const merged = mergeVaults(vault([entry(ID[0], 'Mail', 1)]), other, now)
  assert.equal(merged.entries.length, 0)
  assert.equal(merged.trash[0].id, ID[0])
})

test('permanently deleted logins do not come back from an older device', () => {
  const deleted = deleteForever(moveToTrash(vault([entry(ID[0], 'Mail', 1)]), ID[0], new Date(at(2))), ID[0], new Date(at(3)))
  const merged = mergeVaults(vault([entry(ID[0], 'Mail', 1)]), deleted, now)
  assert.equal(merged.entries.length, 0)
  assert.equal(merged.trash.length, 0)
  assert.deepEqual(merged.deleted.map(d => d.id), [ID[0]])
  const emptied = emptyTrash(moveToTrash(vault([entry(ID[1], 'Bank', 1)]), ID[1], new Date(at(2))), new Date(at(4)))
  assert.deepEqual(emptied.deleted.map(d => d.id), [ID[1]])
})

test('restoring from the trash wins over the older deletion', () => {
  const trashed = moveToTrash(vault([entry(ID[0], 'Mail', 1)]), ID[0], new Date(at(2)))
  const restored = restoreFromTrash(trashed, ID[0], undefined, new Date(at(6)))
  const merged = mergeVaults(trashed, restored, now)
  assert.equal(merged.entries[0]?.id, ID[0])
  assert.equal(merged.trash.length, 0)
})

test('device settings stay local and merging is stable', () => {
  const local = vault([entry(ID[0], 'Mail', 1)], { settings: { ...emptyVault().settings, autoLock: 1 } })
  const remote = vault([entry(ID[2], 'Chat', 1)], { settings: { ...emptyVault().settings, autoLock: 15 } })
  const merged = mergeVaults(local, remote, now)
  assert.equal(merged.settings.autoLock, 1)
  assert.ok(sameContent(merged, mergeVaults(remote, merged, now)))
  assert.ok(vaultSchema.safeParse(merged).success)
})

test('older vaults without tombstones still parse', () => {
  const { deleted: _deleted, ...legacy } = emptyVault()
  assert.deepEqual(vaultSchema.parse(legacy).deleted, [])
})
