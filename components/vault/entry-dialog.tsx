'use client'

import { useMemo, useState } from 'react'
import { Copy, History, LockKeyhole, PencilLine, RefreshCw, RotateCcw, Save, Star, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group'
import { CopyButton } from './copy-button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PasswordInput, StrengthMeter } from './password-input'
import { ServicePicker } from './service-picker'
import { VaultSelect } from './vault-select'
import { TagInput } from './tag-input'
import { generatePassword } from '@/lib/generator'
import { copySecret } from '@/lib/clipboard'
import { allTags, CATEGORIES, entrySchema, messageOf, withPasswordHistory, type Entry } from '@/lib/types'
import { TRASH_DAYS } from '@/lib/trash'
import type { VaultController } from '@/hooks/use-vault'

const FIELD_LABELS = { title: 'Title', username: 'Username', password: 'Password', url: 'Website', notes: 'Notes', category: 'Category', icon: 'Icon', tags: 'Tags', favorite: 'Favorite' } as const

function changedFields(before: Entry | undefined, after: Entry) {
  if (!before) return []
  return (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)).map(key => FIELD_LABELS[key])
}

export function EntryDialog({ entry, onClose, vault, initialPassword = '' }: { entry?: Entry; onClose: () => void; vault: VaultController; initialPassword?: string }) {
  const [form, setForm] = useState<Entry>(() => entry ?? { id: crypto.randomUUID(), title: '', username: '', password: initialPassword, url: '', notes: '', category: 'Personal' as const, tags: [], favorite: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), passwordChangedAt: new Date().toISOString() })
  const [error, setError] = useState('')
  const existingTags = useMemo(() => allTags(vault.data?.entries ?? []), [vault.data?.entries])
  // An existing password stays read-only until the user explicitly chooses to change it.
  const [passwordLocked, setPasswordLocked] = useState(Boolean(entry?.password))
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const timeout = vault.data?.settings.clipboardTimeout
  const changes = changedFields(entry, form)
  const unchanged = Boolean(entry) && changes.length === 0
  const passwordChanged = Boolean(entry) && form.password !== entry?.password
  const history = entry?.passwordHistory ?? []
  function patch<K extends keyof Entry>(key: K, value: Entry[K]) { setForm(current => ({ ...current, [key]: value })) }
  function setPassword(password: string) { patch('password', password); setConfirmEmpty(false) }
  function restorePassword() { if (entry) { setPassword(entry.password); setPasswordLocked(Boolean(entry.password)) } }
  function unlockPassword() { setPasswordLocked(false); requestAnimationFrame(() => document.getElementById('entry-password')?.focus()) }
  async function moveToTrash() {
    if (!entry) return
    try {
      await vault.deleteEntry(entry.id)
      toast.success(`Moved to trash. Recoverable for ${TRASH_DAYS} days.`, { action: { label: 'Undo', onClick: () => { vault.restoreEntry(entry.id).then(() => toast.success('Login restored.'), error => toast.error(messageOf(error))) } } })
      onClose()
    } catch (error) { setError(messageOf(error)) }
  }

  return <Dialog open onOpenChange={value => { if (!value && !vault.busy) onClose() }}><DialogContent className="sm:max-w-xl">
    <DialogHeader><DialogTitle>{entry ? 'Edit login' : 'New login'}</DialogTitle><DialogDescription>{entry ? 'The password stays locked until you choose to change it. Changes are encrypted on save.' : 'Add the details. Vault takes care of keeping them private.'}</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-5" onSubmit={async event => {
      event.preventDefault(); setError('')
      if (entry?.password && !form.password && !confirmEmpty) { setConfirmEmpty(true); return }
      const now = new Date().toISOString()
      const result = entrySchema.safeParse({ ...form, title: form.title.trim(), tags: [...new Set(form.tags.map(tag => tag.trim()).filter(Boolean))], modifiedAt: now, passwordChangedAt: entry && entry.password === form.password ? entry.passwordChangedAt : now })
      if (!result.success) { setError(result.error.issues[0].message); return }
      try {
        await vault.saveEntry(withPasswordHistory(entry, result.data, now))
        if (entry) toast.success('Changes encrypted and saved.', { action: { label: 'Undo', onClick: () => { vault.saveEntry(entry).then(() => toast.success('Change undone.'), error => toast.error(messageOf(error))) } } })
        else toast.success('Login added to your vault.')
        onClose()
      } catch (error) { setError(messageOf(error)) }
    }}>
      <ServicePicker selected={form.icon} category={form.category} disabled={vault.busy} onSelect={icon => setForm(current => ({ ...current, icon: icon?.slug, title: current.title || icon?.title || '' }))} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="entry-title">Title</FieldLabel><Input id="entry-title" placeholder="e.g. Personal email" value={form.title} onChange={event => patch('title', event.target.value)} maxLength={200} required autoFocus={!entry} autoComplete="off" /></Field>
        <Field><FieldLabel htmlFor="entry-username">Username or email</FieldLabel><InputGroup><InputGroupInput id="entry-username" placeholder="you@example.com" value={form.username} onChange={event => patch('username', event.target.value)} maxLength={1000} autoComplete="off" spellCheck={false} /><InputGroupAddon align="inline-end"><CopyButton inInput value={form.username} label="username or email" timeout={timeout} /></InputGroupAddon></InputGroup></Field>
        <Field>
          <div className="flex items-center justify-between"><FieldLabel htmlFor="entry-password">Password</FieldLabel><div className="flex items-center gap-1">{!passwordLocked && <Button type="button" variant="ghost" size="icon" aria-label="Generate a password" onClick={() => setPassword(generatePassword())}><RefreshCw /></Button>}<Button type="button" variant="ghost" size="icon" disabled={!form.password} aria-label="Copy password" onClick={() => void copySecret(form.password, timeout)}><Copy /></Button></div></div>
          <PasswordInput id="entry-password" placeholder="Enter or generate a password" value={form.password} readOnly={passwordLocked} aria-describedby={passwordLocked ? 'entry-password-locked' : undefined} onChange={event => setPassword(event.target.value)} maxLength={4096} autoComplete="off" />
          {passwordLocked
            ? <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span id="entry-password-locked" className="flex items-center gap-1.5"><LockKeyhole className="size-4" aria-hidden="true" />Locked, so it can&apos;t be changed by accident.</span><Button type="button" variant="outline" size="sm" onClick={unlockPassword}><PencilLine data-icon="inline-start" />Change password</Button></div>
            : <>
              <StrengthMeter password={form.password} />
              {passwordChanged && entry && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm" aria-live="polite"><span>{form.password ? 'New password. The old one stays in the password history.' : 'The password is empty.'}</span><Button type="button" variant="ghost" size="sm" onClick={restorePassword}><RotateCcw data-icon="inline-start" />Restore old password</Button></div>}
            </>}
        </Field>
        <Field><FieldLabel htmlFor="entry-url">Website</FieldLabel><Input id="entry-url" type="url" placeholder="https://example.com" value={form.url} onChange={event => patch('url', event.target.value)} maxLength={2000} autoComplete="off" /></Field>
        <Field><FieldLabel htmlFor="entry-category">Category</FieldLabel><VaultSelect id="entry-category" label="Category" className="w-full" value={form.category} disabled={vault.busy} onChange={value => patch('category', value as Entry['category'])} options={CATEGORIES.filter((category, index) => index < 6 || category === form.category).map(category => ({ value: category, label: category }))} /></Field>
        <Field><FieldLabel htmlFor="entry-tags">Tags</FieldLabel><TagInput id="entry-tags" value={form.tags} suggestions={existingTags} disabled={vault.busy} onChange={tags => patch('tags', tags)} /></Field>
        <details className="rounded-xl border border-border p-4" open={entry?.notes ? true : undefined}><summary className="cursor-pointer text-sm font-medium">Notes</summary><FieldGroup className="pt-4"><Field><FieldLabel htmlFor="entry-notes">Notes</FieldLabel><Textarea id="entry-notes" placeholder="Anything else worth keeping safe…" value={form.notes} onChange={event => patch('notes', event.target.value)} maxLength={20000} rows={3} /></Field></FieldGroup></details>
        {history.length > 0 && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium"><History className="mr-2 inline size-4 align-text-bottom" aria-hidden="true" />Password history ({history.length})</summary>
          <ul className="flex flex-col gap-3 pt-4">{history.map((item, index) => <li key={`${item.replacedAt}-${index}`} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex flex-col"><span aria-hidden="true">{'••••••••••'}</span><span className="text-muted-foreground">Replaced {new Date(item.replacedAt).toLocaleString()}</span></span>
            <span className="flex items-center gap-1"><CopyButton compact password value={item.password} label="old password" timeout={timeout} /><Button type="button" variant="ghost" size="sm" disabled={item.password === form.password} onClick={() => { setPassword(item.password); setPasswordLocked(false) }}>Use again</Button></span>
          </li>)}</ul>
        </details>}
      </FieldGroup>
      <Button type="button" variant={form.favorite ? 'secondary' : 'outline'} onClick={() => patch('favorite', !form.favorite)} aria-pressed={form.favorite}><Star data-icon="inline-start" fill={form.favorite ? 'currentColor' : 'none'} />{form.favorite ? 'Added to favorites' : 'Add to favorites'}</Button>
      {entry && <div className="flex flex-col gap-1 text-sm text-muted-foreground"><span>Created {new Date(entry.createdAt).toLocaleString()}</span><span>Modified {new Date(entry.modifiedAt).toLocaleString()}</span></div>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      {confirmEmpty && entry
        ? <div role="alert" className="rounded-xl border border-destructive/50 bg-background p-4"><p className="mb-3 flex items-start gap-2 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />You removed the password of this login. Save it without a password?</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={restorePassword}>Restore password</Button><Button type="submit" variant="destructive" disabled={vault.busy}>Save without password</Button></div></div>
        : <div className="flex flex-col gap-3">
            {entry && <p className="text-sm text-muted-foreground" aria-live="polite">{unchanged ? 'No changes yet.' : <>Will save: <span className="font-medium text-foreground">{changes.join(', ')}</span></>}</p>}
            <div className="flex items-center justify-between"><div>{entry && <Button type="button" variant="ghost" size="icon" aria-label="Move login to trash" disabled={vault.busy} onClick={moveToTrash}><Trash2 /></Button>}</div><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={vault.busy}>Cancel</Button><Button type="submit" disabled={vault.busy || unchanged}><Save data-icon="inline-start" />{vault.busy ? 'Encrypting…' : entry ? 'Save changes' : 'Save login'}</Button></div></div>
          </div>}
    </form>
  </DialogContent></Dialog>
}
