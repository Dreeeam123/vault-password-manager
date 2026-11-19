'use client'

import { useMemo, useState } from 'react'
import { Copy, RefreshCw, Save, Star, Trash2 } from 'lucide-react'
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
import { allTags, CATEGORIES, entrySchema, messageOf, type Entry } from '@/lib/types'
import type { VaultController } from '@/hooks/use-vault'

export function EntryDialog({ entry, onClose, vault, initialPassword = '' }: { entry?: Entry; onClose: () => void; vault: VaultController; initialPassword?: string }) {
  const [form, setForm] = useState<Entry>(() => entry ?? { id: crypto.randomUUID(), title: '', username: '', password: initialPassword, url: '', notes: '', category: 'Personal' as const, tags: [], favorite: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), passwordChangedAt: new Date().toISOString() })
  const [error, setError] = useState('')
  const existingTags = useMemo(() => allTags(vault.data?.entries ?? []), [vault.data?.entries])
  const [deleting, setDeleting] = useState(false)
  function patch<K extends keyof Entry>(key: K, value: Entry[K]) { setForm(current => ({ ...current, [key]: value })) }
  return <Dialog open onOpenChange={value => { if (!value && !vault.busy) onClose() }}><DialogContent className="sm:max-w-xl">
    <DialogHeader><DialogTitle>{entry ? 'Edit login' : 'New login'}</DialogTitle><DialogDescription>{entry ? 'View or update this entry. Changes are encrypted on save.' : 'Add the details. Vault takes care of keeping them private.'}</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-5" onSubmit={async event => {
      event.preventDefault(); setError('')
      const now = new Date().toISOString()
      const result = entrySchema.safeParse({ ...form, title: form.title.trim(), tags: [...new Set(form.tags.map(tag => tag.trim()).filter(Boolean))], modifiedAt: now, passwordChangedAt: entry && entry.password === form.password ? entry.passwordChangedAt : now })
      if (!result.success) { setError(result.error.issues[0].message); return }
      try { await vault.saveEntry(result.data); toast.success(entry ? 'Changes encrypted and saved.' : 'Login added to your vault.'); onClose() } catch (error) { setError(messageOf(error)) }
    }}>
      <ServicePicker selected={form.icon} category={form.category} disabled={vault.busy} onSelect={icon => setForm(current => ({ ...current, icon: icon?.slug, title: current.title || icon?.title || '' }))} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="entry-title">Title</FieldLabel><Input id="entry-title" placeholder="e.g. Personal email" value={form.title} onChange={event => patch('title', event.target.value)} maxLength={200} required autoFocus autoComplete="off" /></Field>
        <Field><FieldLabel htmlFor="entry-username">Username or email</FieldLabel><InputGroup><InputGroupInput id="entry-username" placeholder="you@example.com" value={form.username} onChange={event => patch('username', event.target.value)} maxLength={1000} autoComplete="off" spellCheck={false} /><InputGroupAddon align="inline-end"><CopyButton inInput value={form.username} label="username or email" timeout={vault.data?.settings.clipboardTimeout} /></InputGroupAddon></InputGroup></Field>
        <Field><div className="flex items-center justify-between"><FieldLabel htmlFor="entry-password">Password</FieldLabel><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" aria-label="Generate a password" onClick={() => patch('password', generatePassword())}><RefreshCw /></Button><Button type="button" variant="ghost" size="icon" disabled={!form.password} aria-label="Copy password" onClick={() => void copySecret(form.password, vault.data?.settings.clipboardTimeout)}><Copy /></Button></div></div><PasswordInput id="entry-password" placeholder="Enter or generate a password" value={form.password} onChange={event => patch('password', event.target.value)} maxLength={4096} autoComplete="off" /><StrengthMeter password={form.password} /></Field>
        <Field><FieldLabel htmlFor="entry-url">Website</FieldLabel><Input id="entry-url" type="url" placeholder="https://example.com" value={form.url} onChange={event => patch('url', event.target.value)} maxLength={2000} autoComplete="off" /></Field>
        <Field><FieldLabel htmlFor="entry-category">Category</FieldLabel><VaultSelect id="entry-category" label="Category" className="w-full" value={form.category} disabled={vault.busy} onChange={value => patch('category', value as Entry['category'])} options={CATEGORIES.filter((category, index) => index < 6 || category === form.category).map(category => ({ value: category, label: category }))} /></Field>
        <Field><FieldLabel htmlFor="entry-tags">Tags</FieldLabel><TagInput id="entry-tags" value={form.tags} suggestions={existingTags} disabled={vault.busy} onChange={tags => patch('tags', tags)} /></Field>
        <details className="rounded-xl border border-border p-4" open={entry?.notes ? true : undefined}><summary className="cursor-pointer text-sm font-medium">Notes</summary><FieldGroup className="pt-4"><Field><FieldLabel htmlFor="entry-notes">Notes</FieldLabel><Textarea id="entry-notes" placeholder="Anything else worth keeping safe…" value={form.notes} onChange={event => patch('notes', event.target.value)} maxLength={20000} rows={3} /></Field></FieldGroup></details>
      </FieldGroup>
      <Button type="button" variant={form.favorite ? 'secondary' : 'outline'} onClick={() => patch('favorite', !form.favorite)} aria-pressed={form.favorite}><Star data-icon="inline-start" fill={form.favorite ? 'currentColor' : 'none'} />{form.favorite ? 'Added to favorites' : 'Add to favorites'}</Button>
      {entry && <div className="flex flex-col gap-1 text-sm text-muted-foreground"><span>Created {new Date(entry.createdAt).toLocaleString()}</span><span>Modified {new Date(entry.modifiedAt).toLocaleString()}</span></div>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      {deleting ? <div className="rounded-xl border border-border bg-background p-4"><p className="mb-3 text-sm">Permanently delete this login? This cannot be undone.</p><div className="flex gap-2"><Button type="button" variant="destructive" disabled={vault.busy} onClick={async () => { try { await vault.deleteEntry(form.id); toast.success('Login deleted.'); onClose() } catch (error) { setError(messageOf(error)) } }}>Delete permanently</Button><Button type="button" variant="outline" onClick={() => setDeleting(false)}>Keep login</Button></div></div> : <div className="flex items-center justify-between"><div>{entry && <Button type="button" variant="ghost" size="icon" aria-label="Delete login" onClick={() => setDeleting(true)}><Trash2 /></Button>}</div><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={vault.busy}>Cancel</Button><Button type="submit" disabled={vault.busy}><Save data-icon="inline-start" />{vault.busy ? 'Encrypting…' : 'Save login'}</Button></div></div>}
    </form>
  </DialogContent></Dialog>
}
