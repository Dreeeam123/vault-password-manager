'use client'

import { useState } from 'react'
import { FolderSync, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from './password-input'
import type { VaultController } from '@/hooks/use-vault'
import { messageOf } from '@/lib/types'
import { SyncPasswordNeeded } from '@/lib/sync-file'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export function SyncSection({ vault }: { vault: VaultController }) {
  const sync = vault.sync
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')

  async function syncNow(withPassword?: string) {
    try {
      const { rekeyed } = await sync.now(withPassword)
      setAsking(false); setPassword('')
      toast.success(rekeyed ? 'Synced. This device now uses the master password of the sync file. Turn fingerprint unlock on again if you use it.' : 'Synced.')
    } catch (error) {
      if (error instanceof SyncPasswordNeeded) { setAsking(true); return }
      toast.error(messageOf(error))
    }
  }
  async function choose(create: boolean) {
    try { if (await sync.choose(create)) await syncNow() } catch (error) { toast.error(messageOf(error)) }
  }

  return <section aria-labelledby="sync-heading">
    <h2 id="sync-heading" className="eyebrow mb-4">Sync between devices</h2>
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <FolderSync className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{sync.fileName ? sync.fileName : 'Sync with a folder you already use'}</h3>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {!sync.supported
              ? 'Sync is available in the Android and Windows apps.'
              : sync.fileName
                ? sync.error ?? (sync.at ? `Last synced at ${timeFormat.format(sync.at)}. Changes sync automatically.` : 'Changes sync automatically while Vault is unlocked.')
                : 'Vault keeps one encrypted file in a folder that syncs, such as Google Drive, OneDrive, Dropbox or Syncthing. The file is encrypted with your master password, so the cloud only ever sees ciphertext.'}
          </p>
        </div>
      </div>
      {sync.supported && <div className="flex flex-wrap gap-2">
        {sync.fileName ? <>
          <Button onClick={() => void syncNow()} disabled={vault.busy}><RefreshCw data-icon="inline-start" />{sync.needsPassword ? 'Enter password and sync' : 'Sync now'}</Button>
          <Button variant="outline" onClick={() => void sync.stop().then(() => toast.success('Sync turned off. The file stays where it is.'))} disabled={vault.busy}>Stop syncing</Button>
        </> : <>
          <Button onClick={() => void choose(true)} disabled={vault.busy}>Create sync file</Button>
          <Button variant="outline" onClick={() => void choose(false)} disabled={vault.busy}>Use existing sync file</Button>
        </>}
      </div>}
    </div>
    {asking && <Dialog open onOpenChange={value => { if (!value && !vault.busy) { setAsking(false); setPassword('') } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Master password of the sync file</DialogTitle>
          <DialogDescription>This file was created on another device or its master password was changed. Enter that password once. Afterwards this device unlocks with it too.</DialogDescription>
        </DialogHeader>
        <form onSubmit={event => { event.preventDefault(); void syncNow(password) }}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="sync-password">Master password</FieldLabel><PasswordInput id="sync-password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} autoFocus /></Field>
            <Button type="submit" disabled={vault.busy || !password}>Unlock sync file</Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>}
  </section>
}
