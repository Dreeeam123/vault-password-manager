import type { Entry, TrashedEntry, VaultData } from './types'

export const TRASH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const TRASH_MS = TRASH_DAYS * DAY_MS

export const isExpired = (item: TrashedEntry, now: number) => now - Date.parse(item.deletedAt) >= TRASH_MS

/** Days until a trashed login is removed for good; never below 1 while it is still listed. */
export function daysLeft(item: TrashedEntry, now = Date.now()) {
  return Math.max(1, Math.ceil((Date.parse(item.deletedAt) + TRASH_MS - now) / DAY_MS))
}

const tombstones = (data: VaultData, ids: string[], at: string) =>
  [...ids.map(id => ({ id, at })), ...data.deleted.filter(item => !ids.includes(item.id))]

export function purgeExpired(data: VaultData, now = Date.now()): VaultData {
  const expired = data.trash.filter(item => isExpired(item, now))
  if (!expired.length) return data
  return { ...data, trash: data.trash.filter(item => !isExpired(item, now)), deleted: tombstones(data, expired.map(item => item.id), new Date(now).toISOString()) }
}

export function moveToTrash(data: VaultData, id: string, now = new Date()): VaultData {
  const entry = data.entries.find(item => item.id === id)
  if (!entry) return data
  const trashed: TrashedEntry = { ...entry, deletedAt: now.toISOString() }
  return { ...data, entries: data.entries.filter(item => item.id !== id), trash: [trashed, ...data.trash.filter(item => item.id !== id)] }
}

export function restoreFromTrash(data: VaultData, id: string, newId: () => string = () => crypto.randomUUID(), now = new Date()): VaultData {
  const item = data.trash.find(trashed => trashed.id === id)
  if (!item) return data
  const { deletedAt: _deletedAt, ...rest } = item
  // A restore is a change of its own, so it wins over the older deletion on other devices.
  const entry: Entry = { ...rest, modifiedAt: now.toISOString() }
  // A login with the same ID can exist again after a backup restore; never overwrite it.
  const restored: Entry = data.entries.some(existing => existing.id === entry.id) ? { ...entry, id: newId() } : entry
  return { ...data, entries: [...data.entries, restored], trash: data.trash.filter(trashed => trashed.id !== id) }
}

export const deleteForever = (data: VaultData, id: string, now = new Date()): VaultData =>
  ({ ...data, trash: data.trash.filter(item => item.id !== id), deleted: tombstones(data, [id], now.toISOString()) })
export const emptyTrash = (data: VaultData, now = new Date()): VaultData =>
  ({ ...data, trash: [], deleted: tombstones(data, data.trash.map(item => item.id), now.toISOString()) })
