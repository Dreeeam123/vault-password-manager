import assert from 'node:assert/strict'
import { test } from 'node:test'
import { entrySchema, PASSWORD_HISTORY_LIMIT, withPasswordHistory, type Entry } from '../lib/types'

const at = '2026-01-01T00:00:00.000Z'
const base: Entry = { id: '7d6f2a1e-4c1b-4f7a-9a52-1f0c3b9e8d11', title: 'Mail', username: 'me', password: 'old-secret', url: '', notes: '', category: 'Personal', tags: [], favorite: false, createdAt: at, modifiedAt: at, passwordChangedAt: at }

test('a changed password keeps the previous one, newest first', () => {
  const once = withPasswordHistory(base, { ...base, password: 'new-secret' }, '2026-02-01T00:00:00.000Z')
  assert.deepEqual(once.passwordHistory, [{ password: 'old-secret', replacedAt: '2026-02-01T00:00:00.000Z' }])
  const twice = withPasswordHistory(once, { ...once, password: 'third' }, '2026-03-01T00:00:00.000Z')
  assert.deepEqual(twice.passwordHistory?.map(item => item.password), ['new-secret', 'old-secret'])
  assert.ok(entrySchema.safeParse(twice).success)
})

test('an unchanged or new password adds no history', () => {
  assert.equal(withPasswordHistory(base, { ...base, title: 'Renamed' }, at).passwordHistory, undefined)
  assert.equal(withPasswordHistory(undefined, base, at).passwordHistory, undefined)
})

test('reusing an old password moves it out of the history and the list stays capped', () => {
  let entry = base
  for (let index = 0; index < PASSWORD_HISTORY_LIMIT + 5; index++) entry = withPasswordHistory(entry, { ...entry, password: `p${index}` }, at)
  assert.equal(entry.passwordHistory?.length, PASSWORD_HISTORY_LIMIT)
  const reused = withPasswordHistory(entry, { ...entry, password: 'p10' }, at)
  assert.ok(!reused.passwordHistory?.some(item => item.password === 'p10'))
  assert.ok(entrySchema.safeParse(reused).success)
})

test('older vaults without a history still parse', () => {
  assert.ok(entrySchema.safeParse(base).success)
})
