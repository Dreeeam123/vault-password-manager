import { Capacitor, registerPlugin } from '@capacitor/core'
import { parseImportBackup, type ExportMode } from './transfer'

export type SelectedBackup = { name: string; text: string; size: number }
const BackupFile = registerPlugin<{
  save(options: { data: string; fileName: string }): Promise<{ saved: boolean }>
  open(): Promise<({ cancelled: false } & SelectedBackup) | { cancelled: true }>
}>('BackupFile')

export function validateSelectedBackup(file: SelectedBackup): SelectedBackup {
  if (file.size > 20_000_000) throw new Error('Backup must be smaller than 20 MB.')
  parseImportBackup(file.text)
  return file
}

export async function readBrowserBackup(file: File): Promise<SelectedBackup> {
  if (file.size > 20_000_000) throw new Error('Backup must be smaller than 20 MB.')
  return validateSelectedBackup({ name: file.name, size: file.size, text: await file.text() })
}

export async function chooseAndroidBackup(): Promise<SelectedBackup | null> {
  const result = await BackupFile.open()
  return result.cancelled ? null : validateSelectedBackup({ name: result.name, text: result.text, size: result.size })
}
export type BackupResult = 'saved' | 'download-started' | false
export const backupNotice = (result: BackupResult) => result === 'saved'
  ? 'Backup saved. Keep a copy outside this phone.'
  : 'Download started. Check that the .vault file exists and keep a copy outside this device.'

export const saveEncryptedBackup = (data: string) => saveExportFile(data, 'encrypted')

export async function saveExportFile(data: string, mode: ExportMode): Promise<BackupResult> {
  if (mode !== 'encrypted' || parseImportBackup(data).protection !== 'password') throw new Error('Only password-protected backups can be exported. Plaintext exports are disabled for your security.')
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-')
  const fileName = `vault-${stamp}.vault`
  if (Capacitor.getPlatform() === 'android') {
    const result = await BackupFile.save({ data, fileName })
    return result.saved ? 'saved' : false
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'download-started'
}
