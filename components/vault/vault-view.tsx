'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, ChevronLeft, ChevronRight, KeyRound, Plus, Search, ShieldCheck, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { allTags, backupIsStale, CATEGORIES, messageOf, type Entry } from '@/lib/types'
import { backupNotice } from '@/lib/backup'
import { loginPage, selectLogins, type LoginFilters, type LoginSort } from '@/lib/vault-list'
import type { VaultController } from '@/hooks/use-vault'
import { cn } from '@/lib/utils'
import { VaultSelect } from './vault-select'
import { LoginList } from './login-list'

const initialFilters: LoginFilters = { query: '', favorites: false, category: 'all', tag: 'all', sort: 'title' }

export function VaultView({ vault, onAdd, onEdit, onHealth }: { vault: VaultController; onAdd: () => void; onEdit: (entry: Entry) => void; onHealth: () => void }) {
  const [filters, setFilters] = useState<LoginFilters>(initialFilters)
  const [page, setPage] = useState(0)
  const toolbar = useRef<HTMLDivElement>(null)
  const entries = vault.data!.entries
  const visible = useMemo(() => selectLogins(entries, filters), [entries, filters])
  const current = loginPage(visible, page)
  const favorites = entries.filter(entry => entry.favorite).length
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const entry of entries) result.set(entry.category, (result.get(entry.category) ?? 0) + 1)
    return result
  }, [entries])
  const tags = useMemo(() => allTags(entries), [entries])
  const filtering = Boolean(filters.query || filters.favorites || filters.category !== 'all' || filters.tag !== 'all')
  function updateFilters(patch: Partial<LoginFilters>) { setFilters(previous => ({ ...previous, ...patch })); setPage(0) }
  function turnPage(next: number) {
    setPage(next)
    toolbar.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    toolbar.current?.focus({ preventScroll: true })
  }

  return <div className="flex flex-col gap-3 md:gap-4">
    <header className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-2"><h1 className="page-heading">Your vault</h1><p className="text-sm leading-relaxed text-muted-foreground">All your logins. Quietly organized.</p></div>
      <Button onClick={onAdd}><Plus data-icon="inline-start" /><span className="hidden sm:inline">Add login</span><span className="sm:hidden">Add</span></Button>
    </header>

    <div ref={toolbar} tabIndex={-1} aria-label="Login search and filters" className="toolbar-glass sticky top-0 z-10 -mx-5 flex scroll-mt-4 flex-col gap-3 px-5 pb-5 pt-2 outline-none md:-mx-9 md:px-9 lg:-mx-12 lg:px-12">
      <InputGroup>
        <InputGroupInput placeholder="Find a login, email, or tag…" aria-label="Search your vault" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} />
        <InputGroupAddon><Search /></InputGroupAddon>
        {filters.query && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" aria-label="Clear search" onClick={() => updateFilters({ query: '' })}><X /></InputGroupButton></InputGroupAddon>}
      </InputGroup>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup aria-label="Login collection" value={[filters.favorites ? 'favorites' : 'all']} onValueChange={values => { if (values[0]) updateFilters({ favorites: values[0] === 'favorites' }) }}>
          <ToggleGroupItem value="all">All logins <span className="tabular-nums">{entries.length}</span></ToggleGroupItem>
          <ToggleGroupItem value="favorites"><Star data-icon="inline-start" />Favorites <span className="tabular-nums">{favorites}</span></ToggleGroupItem>
        </ToggleGroup>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <VaultSelect label="Filter by category" className="min-w-0 w-full sm:w-auto" value={filters.category} onChange={category => updateFilters({ category })} options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.filter(item => counts.has(item)).map(item => ({ value: item, label: `${item} (${counts.get(item)})` }))]} />
          {tags.length > 0 && <VaultSelect label="Filter by tag" className="min-w-0 w-full sm:w-auto" value={tags.some(tag => tag.toLocaleLowerCase() === filters.tag.toLocaleLowerCase()) ? filters.tag : 'all'} onChange={tag => updateFilters({ tag })} options={[{ value: 'all', label: 'All tags' }, ...tags.map(tag => ({ value: tag, label: `#${tag}` }))]} />}
          <VaultSelect label="Sort entries" className={cn('min-w-0 w-full sm:w-auto', tags.length > 0 && 'col-span-2')} value={filters.sort} onChange={sort => updateFilters({ sort: sort as LoginSort })} options={[{ value: 'title', label: 'Name A–Z' }, { value: 'category', label: 'Category' }, { value: 'modified', label: 'Last modified' }, { value: 'created', label: 'Newest first' }]} />
        </div>
      </div>
    </div>

    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <p role="status" aria-live="polite">{visible.length ? `${current.start + 1}–${current.end} of ${visible.length}` : '0'} {visible.length === 1 ? 'login' : 'logins'}{filtering && <span> found</span>}</p>
      {filtering ? <Button variant="ghost" size="sm" onClick={() => { setFilters(initialFilters); setPage(0) }}>Clear filters<X data-icon="inline-end" /></Button> : <button type="button" onClick={onHealth} className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"><ShieldCheck className="size-4" /><span>Password health</span><ArrowUpRight className="size-4" /></button>}
    </div>

    {visible.length
      ? <LoginList entries={current.entries} sort={filters.sort} timeout={vault.data!.settings.clipboardTimeout} onEdit={onEdit} onToggleFavorite={vault.busy ? undefined : entry => void vault.saveEntry({ ...entry, favorite: !entry.favorite }).catch(error => toast.error(messageOf(error)))} />
      : <section className="panel flex flex-col items-center gap-5 px-6 py-14 text-center">
          <span className="icon-tile size-14 rounded-2xl">{entries.length ? <Search className="size-6 text-muted-foreground" /> : <KeyRound className="size-6 text-primary" />}</span>
          <div className="flex flex-col gap-2"><h2 className="text-xl font-semibold tracking-tight">{entries.length ? 'No matching logins' : 'A home for your logins.'}</h2>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">{entries.length ? 'Try a different name, email, tag, or category. Your other logins are still safely here.' : 'Save your first login. Find it instantly next time, and keep it only on this device.'}</p></div>
          <Button variant={entries.length ? 'outline' : 'default'} onClick={entries.length ? () => { setFilters(initialFilters); setPage(0) } : onAdd}>{entries.length ? <><X data-icon="inline-start" />Clear filters</> : <><Plus data-icon="inline-start" />Add your first login</>}</Button>
        </section>}

    {current.totalPages > 1 && <nav aria-label="Login pages" className="flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={current.page === 0} onClick={() => turnPage(current.page - 1)}><ChevronLeft data-icon="inline-start" />Previous</Button>
      <span className="text-sm tabular-nums text-muted-foreground">{current.page + 1} / {current.totalPages}</span>
      <Button variant="outline" size="sm" disabled={current.page + 1 === current.totalPages} onClick={() => turnPage(current.page + 1)}>Next<ChevronRight data-icon="inline-end" /></Button>
    </nav>}

    {backupIsStale(vault.data!) && <aside aria-label="Backup reminder" className="panel flex items-center justify-between gap-4 rounded-xl p-4">
      <div className="flex min-w-0 items-start gap-3"><ArrowDownToLine className="mt-0.5 hidden size-5 shrink-0 text-primary sm:block" /><div><p className="text-sm font-medium">{vault.data!.settings.lastBackupAt ? 'Keep your backup up to date' : 'Keep a safe copy'}</p><p className="text-sm leading-relaxed text-muted-foreground">Save it outside this device. Keep your master password.</p></div></div>
      <Button variant="outline" size="sm" disabled={vault.busy} onClick={() => void vault.exportBackup().then(saved => { if (saved) toast.success(backupNotice(saved)) }).catch(error => toast.error(messageOf(error)))}>Back up</Button>
    </aside>}
  </div>
}
