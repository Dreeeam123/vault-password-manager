'use client'

import { useMemo, useState } from 'react'
import { Search, TextCursorInput, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cancelAutofill, fillLogin, suggestLogins, type AutofillRequest } from '@/lib/autofill'
import { selectLogins } from '@/lib/vault-list'
import { messageOf, type Entry } from '@/lib/types'
import type { VaultController } from '@/hooks/use-vault'
import { EntryInitial } from './entry-initial'

function LoginChoice({ entry, onPick }: { entry: Entry; onPick: (entry: Entry) => void }) {
  return <li><button type="button" onClick={() => onPick(entry)} className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
    <EntryInitial entry={entry} />
    <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-medium">{entry.title}</span><span className="truncate text-sm text-muted-foreground">{entry.username || 'No username'}</span></span>
  </button></li>
}

export function AutofillPicker({ vault, request }: { vault: VaultController; request: AutofillRequest }) {
  const [query, setQuery] = useState('')
  const entries = vault.data!.entries
  const suggested = useMemo(() => suggestLogins(entries, request), [entries, request])
  const results = useMemo(() => {
    const matches = selectLogins(entries, { query, favorites: false, category: 'all', tag: 'all', sort: 'title' })
    return query ? matches : matches.filter(entry => !suggested.includes(entry))
  }, [entries, query, suggested])
  const target = request.domain ?? request.appName ?? request.packageName ?? 'this app'
  async function pick(entry: Entry) {
    try { await fillLogin(entry) } catch (error) { toast.error(messageOf(error)) }
  }

  return <div className="flex flex-col gap-5">
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2"><p className="flex items-center gap-2 text-sm text-primary"><TextCursorInput className="size-4" aria-hidden="true" />Autofill</p><h1 className="page-heading text-balance">Fill a login</h1><p className="truncate text-sm leading-relaxed text-muted-foreground">Into <span className="font-medium text-foreground">{target}</span>. Only pick a login that belongs here.</p></div>
      <Button variant="outline" onClick={() => void cancelAutofill()}><X data-icon="inline-start" />Cancel</Button>
    </header>
    <InputGroup>
      <InputGroupInput placeholder="Search all logins…" aria-label="Search all logins" value={query} onChange={event => setQuery(event.target.value)} />
      <InputGroupAddon><Search /></InputGroupAddon>
    </InputGroup>
    {!query && suggested.length > 0 && <section aria-labelledby="autofill-suggested" className="flex flex-col gap-2"><h2 id="autofill-suggested" className="eyebrow">Suggested</h2><ul className="panel flex flex-col p-1">{suggested.map(entry => <LoginChoice key={entry.id} entry={entry} onPick={pick} />)}</ul></section>}
    <section aria-labelledby="autofill-all" className="flex flex-col gap-2"><h2 id="autofill-all" className="eyebrow">{query ? 'Results' : suggested.length ? 'Other logins' : 'All logins'}</h2>
      {results.length ? <ul className="panel flex flex-col p-1">{results.map(entry => <LoginChoice key={entry.id} entry={entry} onPick={pick} />)}</ul> : <p className="panel p-6 text-center text-sm text-muted-foreground">{query ? 'No matching logins.' : 'No other logins.'}</p>}
    </section>
  </div>
}
