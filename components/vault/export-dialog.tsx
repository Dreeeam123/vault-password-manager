'use client'

import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { backupNotice } from '@/lib/backup'
import { messageOf } from '@/lib/types'
import type { VaultController } from '@/hooks/use-vault'

export function ExportDialog({ vault, onClose }: { vault: VaultController; onClose: () => void }) {
  const [error, setError] = useState('')
  return <Dialog open onOpenChange={open => { if (!open && !vault.busy) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Save your encrypted backup</DialogTitle><DialogDescription>A password-protected .vault file with all entries and settings, ready to restore on another device.</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-5" onSubmit={async event => {
        event.preventDefault(); setError('')
        try {
          const saved = await vault.exportBackup()
          if (!saved) return
          toast.success(backupNotice(saved))
          onClose()
        } catch (error) { setError(messageOf(error)) }
      }}>
        <Alert><ShieldCheck /><AlertTitle>Encrypted with your master password</AlertTitle><AlertDescription>Keep the master password you use today. This file cannot be opened without it, even if you change your password later. New exports are always encrypted.</AlertDescription></Alert>
        <p className="text-sm leading-relaxed text-muted-foreground">Older unprotected backups and text exports are still readable. Replace those files with an encrypted backup and remove any copies you no longer need.</p>
        {error && <Alert><AlertDescription role="alert">{error}</AlertDescription></Alert>}
        <Button type="submit" disabled={vault.busy}><Download data-icon="inline-start" />{vault.busy ? 'Preparing file…' : 'Save encrypted backup'}</Button>
      </form>
    </DialogContent>
  </Dialog>
}
