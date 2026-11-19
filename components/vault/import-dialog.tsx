'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseImportBackup } from '@/lib/transfer'
import { FileCheck2, FolderOpen, LockKeyhole, Upload } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { chooseAndroidBackup, readBrowserBackup, type SelectedBackup } from '@/lib/backup'
import { PasswordInput } from './password-input'
import { messageOf } from '@/lib/types'
import type { VaultController } from '@/hooks/use-vault'

export function ImportDialog({ open, onClose, vault }: { open: boolean; onClose: () => void; vault: VaultController }) {
  const [file, setFile] = useState<SelectedBackup | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const unprotected = useMemo(() => file ? parseImportBackup(file.text).protection === 'none' : false, [file])
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const android = Capacitor.getPlatform() === 'android'

  // A completed picker supplies a new selection; a later lock clears its plaintext.
  useEffect(() => { setPassword(''); setRepeatPassword(''); setConfirmation(''); setFile(null) }, [vault.lockVersion])

  // The browser file input opens its picker on click and reports back via change or cancel.
  const pickerHold = useRef<(() => void) | null>(null)
  const releasePicker = () => { pickerHold.current?.(); pickerHold.current = null }
  useEffect(() => () => releasePicker(), [])

  async function choose(read: () => Promise<SelectedBackup | null>) {
    setReading(true); setError(''); setPassword(''); setRepeatPassword(''); setConfirmation(''); setFile(null)
    const resume = vault.pauseLock()
    try { setFile(await read()) }
    catch (error) { setError(messageOf(error)) }
    finally { resume(); setReading(false) }
  }

  return <Dialog open={open} onOpenChange={value => { if (!value && !vault.busy && !reading) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Welcome back to your vault.</DialogTitle>
        <DialogDescription>Choose a .vault backup. Password protection is detected automatically. Text exports cannot be imported.</DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-5" onSubmit={async event => {
        event.preventDefault(); setError('')
        if (!file || reading || vault.busy) return
        if (vault.hasVault && confirmation !== 'REPLACE') { setError('Type REPLACE to confirm.'); return }
        if (unprotected && password !== repeatPassword) { setError('New passwords do not match.'); return }
        try { await vault.restore(file.text, password); setPassword(''); setRepeatPassword(''); toast.success('Backup restored. This device’s vault is encrypted.'); onClose() }
        catch (error) { setPassword(''); setError(messageOf(error)) }
      }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="backup-file">Backup file</FieldLabel>
            {android
              ? <Button id="backup-file" type="button" variant="outline" disabled={reading || vault.busy} onClick={() => void choose(chooseAndroidBackup)}><FolderOpen data-icon="inline-start" />{reading ? 'Reading backup…' : file ? 'Choose another file' : 'Choose backup file'}</Button>
              : <Input id="backup-file" type="file" disabled={reading || vault.busy} onClick={event => { event.currentTarget.value = ''; releasePicker(); pickerHold.current = vault.pauseLock(); event.currentTarget.addEventListener('cancel', releasePicker, { once: true }) }} onChange={event => {
                releasePicker()
                const selected = event.target.files?.[0]
                if (selected) void choose(() => readBrowserBackup(selected))
              }} />}
            <p className="text-sm leading-relaxed text-muted-foreground">Look in Downloads or the folder where you saved your .vault file. Files are checked by content, not their extension.</p>
          </Field>
          {file && <>
            <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-secondary p-4 text-foreground">
              <FileCheck2 className="size-5 shrink-0 text-primary" />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-sm text-muted-foreground">{unprotected ? 'Unprotected backup' : 'Password-protected backup'} · {Math.max(1, Math.ceil(file.size / 1024))} KB</p></div>
            </div>
            <Field>
              <FieldLabel htmlFor="backup-password">{unprotected ? 'New master password for this device' : 'Your existing master password'}</FieldLabel>
              <PasswordInput id="backup-password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="off" minLength={unprotected ? 12 : undefined} maxLength={1024} disabled={vault.busy} placeholder={unprotected ? 'At least 12 characters' : 'The password used for this backup'} />
              <p className="text-sm leading-relaxed text-muted-foreground">{unprotected ? 'No old password is needed. Choose a new one to encrypt the restored vault on this device. The exported file stays unprotected.' : 'This unlocks the backup. You do not need to create or confirm a new password.'}</p>
            </Field>
            {unprotected && <Field><FieldLabel htmlFor="repeat-backup-password">Confirm new master password</FieldLabel><PasswordInput id="repeat-backup-password" value={repeatPassword} onChange={event => setRepeatPassword(event.target.value)} required autoComplete="off" maxLength={1024} disabled={vault.busy} /></Field>}
            {vault.hasVault && <Field><FieldLabel htmlFor="replace">Type REPLACE to overwrite this device&apos;s vault</FieldLabel><Input id="replace" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" required disabled={vault.busy} /><p className="text-sm text-muted-foreground">All current entries and settings will be replaced. Export a backup first.</p></Field>}
          </>}
        </FieldGroup>
        {error && <Alert><AlertDescription role="alert">{error}</AlertDescription></Alert>}
        <Button type="submit" disabled={vault.busy || reading || !file || !password || (unprotected && (password.length < 12 || password !== repeatPassword)) || (vault.hasVault && confirmation !== 'REPLACE')}><Upload data-icon="inline-start" />{vault.busy ? 'Restoring securely…' : 'Restore & unlock'}</Button>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" />{unprotected ? 'This file contains readable passwords. Keep it private and delete unnecessary copies after restoring.' : 'Encrypted backups need the master password from the time of export. Your vault stays encrypted on this device.'}</p>
      </form>
    </DialogContent>
  </Dialog>
}
