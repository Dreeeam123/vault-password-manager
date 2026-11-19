import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupLogins, loginPage, selectLogins, type LoginFilters } from '../lib/vault-list'
import type { Entry } from '../lib/types'

const now = '2026-10-11T12:00:00.000Z'
const makeEntry = (title: string, patch: Partial<Entry> = {}): Entry => ({ id: crypto.randomUUID(), title, username: 'account@example.test', password: 'never-search-this-secret', category: 'Personal', favorite: false, tags: [], notes: '', url: '', createdAt: now, modifiedAt: now, passwordChangedAt: now, ...patch })
const filters: LoginFilters = { query: '', favorites: false, category: 'all', tag: 'all', sort: 'title' }

test('Login search combines words, category and favorites without searching passwords', () => {
  const entries = [makeEntry('GitHub', { category: 'Work', favorite: true, tags: ['dev'] }), makeEntry('GitHub', { username: 'private@example.test' })]
  assert.equal(selectLogins(entries, { ...filters, query: '  DEV   GitHub  ', category: 'Work', favorites: true }).length, 1)
  assert.equal(selectLogins(entries, { ...filters, tag: 'DEV' }).length, 1)
  assert.equal(selectLogins(entries, { ...filters, tag: 'finance' }).length, 0)
  assert.equal(selectLogins(entries, { ...filters, query: 'private' })[0].username, 'private@example.test')
  assert.equal(selectLogins(entries, { ...filters, query: 'never-search-this-secret' }).length, 0)
  assert.equal(selectLogins(entries, { ...filters, category: 'Finance' }).length, 0)
})

test('Name ordering is numeric and stable for many accounts of the same service', () => {
  const entries = [makeEntry('Service 10'), makeEntry('Service 2'), makeEntry('GitHub', { username: 'z@example.test' }), makeEntry('GitHub', { username: 'a@example.test' })]
  const originalIds = entries.map(entry => entry.id)
  const sorted = selectLogins(entries, filters)
  assert.deepEqual(sorted.map(entry => entry.title), ['GitHub', 'GitHub', 'Service 2', 'Service 10'])
  assert.equal(sorted[0].username, 'a@example.test')
  assert.deepEqual(entries.map(entry => entry.id), originalIds)
})

test('Alphabet and category grouping retain all entries including accented names', () => {
  const entries = [makeEntry('Äpple'), makeEntry('Apple'), makeEntry('1Password'), makeEntry('Discord', { category: 'Social' })]
  const groups = groupLogins(selectLogins(entries, filters), 'title')
  assert.equal(groups.find(group => group.label === 'A')?.entries.length, 2)
  assert.equal(groups.find(group => group.label === '#')?.entries.length, 1)
  assert.equal(selectLogins(entries, { ...filters, query: 'apple' }).length, 2)
  const categories = groupLogins(selectLogins(entries, { ...filters, sort: 'category' }), 'category')
  assert.deepEqual(categories.map(group => group.label), ['Personal', 'Social'])
})

test('Pagination limits rendering, covers every login and clamps after deletion or filtering', () => {
  const entries = Array.from({ length: 87 }, (_, index) => makeEntry(`Login ${index}`))
  assert.equal(loginPage(entries, 0).entries.length, 40)
  assert.equal(loginPage(entries, 1).entries.length, 40)
  assert.equal(loginPage(entries, 2).entries.length, 7)
  assert.equal(new Set([0, 1, 2].flatMap(page => loginPage(entries, page).entries.map(entry => entry.id))).size, 87)
  assert.equal(loginPage(entries.slice(0, 3), 2).page, 0)
  assert.equal(loginPage([], 8).entries.length, 0)
  assert.equal(loginPage(entries, -1).page, 0)
})

test('Recent ordering remains available alongside the alphabetical default', () => {
  const entries = [makeEntry('A', { createdAt: '2026-01-01T00:00:00.000Z' }), makeEntry('Z', { modifiedAt: '2026-01-01T00:00:00.000Z' })]
  assert.equal(selectLogins(entries, { ...filters, sort: 'created' })[0].title, 'Z')
  assert.equal(selectLogins(entries, { ...filters, sort: 'modified' })[0].title, 'A')
})
