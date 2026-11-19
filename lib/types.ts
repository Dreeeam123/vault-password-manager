import { z } from 'zod'

export const CATEGORIES = ['Personal', 'Work', 'Finance', 'Social', 'Shopping', 'Other', 'Snapchat', 'Discord', 'Instagram', 'TikTok', 'WhatsApp', 'Telegram', 'YouTube', 'Spotify'] as const
export const entrySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  username: z.string().max(1000),
  password: z.string().max(4096),
  url: z.string().max(2000).refine(value => !value || /^https?:\/\//i.test(value), 'Use an http:// or https:// URL.'),
  notes: z.string().max(20000),
  category: z.enum(CATEGORIES),
  icon: z.string().regex(/^[a-z0-9_-]{1,100}$/).optional(),
  tags: z.array(z.string().max(60)).max(20),
  favorite: z.boolean(),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  passwordChangedAt: z.string().datetime(),
})
export const APPEARANCES = ['classic', 'glass', 'gradient', 'midnight', 'forest', 'rose', 'mono', 'ocean', 'amber'] as const
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 0] as const
export const CLIPBOARD_OPTIONS = [15, 30, 60, 0] as const
export const LOCK_ON_LEAVE_OPTIONS = ['immediately', 'auto-lock', 'never'] as const
// 0 means "never" for both timers. Older vaults only contain 1/5/15 and 15/30/60.
export const settingsSchema = z.object({
  autoLock: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(0)]),
  clipboardTimeout: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(0)]),
  lockOnLeave: z.enum(LOCK_ON_LEAVE_OPTIONS).default('immediately'),
  theme: z.enum(['dark', 'light', 'system']),
  appearance: z.enum(APPEARANCES).default('classic'),
  lastBackupAt: z.string().datetime().nullable().default(null),
})
export const vaultSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema).max(10000).refine(entries => new Set(entries.map(e => e.id)).size === entries.length, 'Duplicate entry IDs.'),
  settings: settingsSchema,
})
export type Entry = z.infer<typeof entrySchema>
export type Settings = z.infer<typeof settingsSchema>
export type VaultData = z.infer<typeof vaultSchema>
export type Tab = 'vault' | 'generator' | 'health' | 'settings'
export type Appearance = Settings['appearance']
export const DEFAULT_SETTINGS: Settings = { autoLock: 5, clipboardTimeout: 30, lockOnLeave: 'immediately', theme: 'dark', appearance: 'mono', lastBackupAt: null }
export function allTags(entries: Entry[]): string[] {
  const seen = new Map<string, string>()
  for (const entry of entries) for (const tag of entry.tags) { const key = tag.toLocaleLowerCase(); if (!seen.has(key)) seen.set(key, tag) }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
export function backupIsStale(data: VaultData) {
  if (!data.entries.length) return false
  const last = data.settings.lastBackupAt
  return !last || data.entries.some(entry => entry.modifiedAt > last)
}
export const emptyVault = (): VaultData => ({ version: 1, entries: [], settings: { ...DEFAULT_SETTINGS } })
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Your saved vault has not been changed.'
