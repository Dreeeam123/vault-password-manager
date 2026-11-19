import type { Entry } from './types'

export type LoginSort = 'title' | 'category' | 'modified' | 'created'
export type LoginFilters = { query: string; favorites: boolean; category: string; tag: string; sort: LoginSort }
export const LOGIN_PAGE_SIZE = 40
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export function selectLogins(entries: Entry[], filters: LoginFilters): Entry[] {
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  return entries.filter(entry => {
    if (filters.favorites && !entry.favorite) return false
    if (filters.category !== 'all' && entry.category !== filters.category) return false
    if (filters.tag !== 'all' && !entry.tags.some(tag => tag.toLocaleLowerCase() === filters.tag.toLocaleLowerCase())) return false
    const searchable = normalize([entry.title, entry.username, entry.url, entry.notes, entry.category, ...entry.tags].join(' '))
    return terms.every(term => searchable.includes(term))
  }).sort((a, b) => {
    const titleOrder = collator.compare(a.title, b.title) || collator.compare(a.username, b.username) || a.id.localeCompare(b.id)
    if (filters.sort === 'category') return collator.compare(a.category, b.category) || titleOrder
    if (filters.sort === 'modified') return b.modifiedAt.localeCompare(a.modifiedAt) || titleOrder
    if (filters.sort === 'created') return b.createdAt.localeCompare(a.createdAt) || titleOrder
    return titleOrder
  })
}

export function loginPage(entries: Entry[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(entries.length / LOGIN_PAGE_SIZE))
  const page = Math.max(0, Math.min(requestedPage, totalPages - 1))
  const start = page * LOGIN_PAGE_SIZE
  return { entries: entries.slice(start, start + LOGIN_PAGE_SIZE), page, totalPages, start, end: Math.min(start + LOGIN_PAGE_SIZE, entries.length) }
}

export function groupLogins(entries: Entry[], sort: LoginSort) {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const letter = normalize(entry.title).charAt(0).toUpperCase()
    const label = sort === 'category' ? entry.category : sort === 'title' ? (/^[A-Z]$/.test(letter) ? letter : '#') : sort === 'modified' ? 'Recently updated' : 'Recently added'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(entry)
  }
  return Array.from(groups, ([label, entries]) => ({ label, entries }))
}

export function loginDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return '' }
}
