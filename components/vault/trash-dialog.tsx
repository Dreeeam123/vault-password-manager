'use client'

import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { daysLeft, isExpired, TRASH_DAYS } from '@/lib/trash'
import { messageOf } from '@/lib/types'
import type { VaultController } from '@/hooks/use-vault'
import { EntryInitial } from './entry-initial'

export function TrashDialog({ vault, onClose }: { vault: VaultController; onClose: () => void }) {
  const now = Date.now()
  const items = vault.data!.trash.filter(item => !isExpired(item, now))
  const [confirm, setConfirm] = useState<string | 'all' | null>(null)
  async function act(operation: () => Promise<void>, message: string) {
    try { await operation(); setConfirm(null); toast.success(message) } catch (error) { toast.error(messageOf(error)) }
  }

  return <Dialog open onOpenChange={value => { if (!value && !vault.busy) onClose() }}><DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle>Trash</DialogTitle><DialogDescription>Deleted logins stay here for {TRASH_DAYS} days, encrypted like the rest of your vault. Then they are removed for good.</DialogDescription></DialogHeader>
    {items.length === 0
      ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">The trash is empty.</p>
      : <ul className="-mx-1 flex max-h-[50dvh] flex-col overflow-y-auto">{items.map(item => <li key={item.id} className="flex flex-col gap-2 border-b border-border px-1 py-3 last:border-0">
          <div className="flex items-center gap-3">
            <EntryInitial entry={item} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-sm text-muted-foreground">{item.username || 'No username'} · {daysLeft(item, now)} {daysLeft(item, now) === 1 ? 'day' : 'days'} left</p></div>
            <Button variant="outline" size="sm" disabled={vault.busy} onClick={() => void act(() => vault.restoreEntry(item.id), `${item.title} is back in your vault.`)}><RotateCcw data-icon="inline-start" />Restore</Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${item.title} forever`} disabled={vault.busy} onClick={() => setConfirm(item.id)}><Trash2 /></Button>
          </div>
          {confirm === item.id && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/50 p-3 text-sm"><span>Delete forever? This cannot be undone.</span><span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Keep</Button><Button size="sm" variant="destructive" disabled={vault.busy} onClick={() => void act(() => vault.deleteForever(item.id), 'Deleted forever.')}>Delete forever</Button></span></div>}
        </li>)}</ul>}
    {items.length > 0 && (confirm === 'all'
      ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/50 p-4 text-sm"><p>Delete all {items.length} {items.length === 1 ? 'login' : 'logins'} in the trash forever? This cannot be undone.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>Keep them</Button><Button variant="destructive" disabled={vault.busy} onClick={() => void act(vault.emptyTrash, 'Trash emptied.')}>Empty trash</Button></div></div>
      : <div className="flex justify-between gap-2"><Button variant="ghost" disabled={vault.busy} onClick={() => setConfirm('all')}>Empty trash</Button><Button variant="outline" onClick={onClose}>Done</Button></div>)}
  </DialogContent></Dialog>
}
