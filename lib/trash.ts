import type { Entry, TrashedEntry, VaultData } from './types'

export const TRASH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const TRASH_MS = TRASH_DAYS * DAY_MS

export const isExpired = (item: TrashedEntry, now: number) => now - Date.parse(item.deletedAt) >= TRASH_MS

/** Days until a trashed login is removed for good; never below 1 while it is still listed. */
export function daysLeft(item: TrashedEntry, now = Date.now()) {
  return Math.max(1, Math.ceil((Date.parse(item.deletedAt) + TRASH_MS - now) / DAY_MS))
}

export function purgeExpired(data: VaultData, now = Date.now()): VaultData {
  const trash = data.trash.filter(item => !isExpired(item, now))
  return trash.length === data.trash.length ? data : { ...data, trash }
}

export function moveToTrash(data: VaultData, id: string, now = new Date()): VaultData {
  const entry = data.entries.find(item => item.id === id)
  if (!entry) return data
  const trashed: TrashedEntry = { ...entry, deletedAt: now.toISOString() }
  return { ...data, entries: data.entries.filter(item => item.id !== id), trash: [trashed, ...data.trash.filter(item => item.id !== id)] }
}

export function restoreFromTrash(data: VaultData, id: string, newId: () => string = () => crypto.randomUUID()): VaultData {
  const item = data.trash.find(trashed => trashed.id === id)
  if (!item) return data
  const { deletedAt: _deletedAt, ...entry } = item
  // A login with the same ID can exist again after a backup restore; never overwrite it.
  const restored: Entry = data.entries.some(existing => existing.id === entry.id) ? { ...entry, id: newId() } : entry
  return { ...data, entries: [...data.entries, restored], trash: data.trash.filter(trashed => trashed.id !== id) }
}

export const deleteForever = (data: VaultData, id: string): VaultData => ({ ...data, trash: data.trash.filter(item => item.id !== id) })
export const emptyTrash = (data: VaultData): VaultData => ({ ...data, trash: [] })
