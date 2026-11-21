import { z } from 'zod'
import { envelopeSchema, parseBackup, type Envelope } from './crypto'
import { vaultSchema, type VaultData } from './types'

export type ExportMode = 'encrypted' | 'unprotected' | 'text'
const plainBackupSchema = z.object({
  format: z.literal('vault-unprotected'),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: vaultSchema,
}).strict()
export type ImportBackup = { protection: 'password'; envelope: Envelope } | { protection: 'none'; data: VaultData }

export function parseImportBackup(text: string): ImportBackup {
  if (new TextEncoder().encode(text).byteLength > 20_000_000) throw new Error('Backup is too large (maximum 20 MB).')
  if (text.startsWith('VAULT TEXT EXPORT')) throw new Error('Text exports are read-only and cannot be imported. Choose a .vault backup instead.')
  try {
    const value: unknown = JSON.parse(text)
    if (envelopeSchema.safeParse(value).success) return { protection: 'password', envelope: parseBackup(text) }
    const plain = plainBackupSchema.parse(value)
    return { protection: 'none', data: plain.data }
  } catch { throw new Error('This is not a supported Vault backup. Choose an encrypted or unprotected .vault file, not a text export.') }
}

export function serializeUnprotectedBackup(data: VaultData): string {
  const text = JSON.stringify(plainBackupSchema.parse({ format: 'vault-unprotected', version: 1, exportedAt: new Date().toISOString(), data }))
  if (new TextEncoder().encode(text).byteLength > 20_000_000) throw new Error('Backup is too large (maximum 20 MB).')
  return text
}

export function serializeTextExport(input: VaultData): string {
  const data = vaultSchema.parse(input)
  const lines = ['VAULT TEXT EXPORT — NOT IMPORTABLE', 'UNENCRYPTED: anyone with this file can read every password.', `Exported: ${new Date().toISOString()}`, `Entries: ${data.entries.length}`, '']
  for (const entry of data.entries) {
    lines.push('────────────────────────', `Title: ${entry.title}`, `Username: ${entry.username}`, `Password: ${entry.password}`, `Website: ${entry.url}`, `Category: ${entry.category}`, `Tags: ${entry.tags.join(', ')}`, `Favorite: ${entry.favorite ? 'Yes' : 'No'}`, `Created: ${entry.createdAt}`, `Modified: ${entry.modifiedAt}`, `Password changed: ${entry.passwordChangedAt}`, ...(entry.passwordHistory ?? []).map(item => `Previous password (replaced ${item.replacedAt}): ${item.password}`), `Notes:\n${entry.notes}`, '')
  }
  return lines.join('\n')
}
