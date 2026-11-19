'use client'

import { Star } from 'lucide-react'
import type { Entry } from '@/lib/types'
import { groupLogins, loginDomain, type LoginSort } from '@/lib/vault-list'
import { cn } from '@/lib/utils'
import { CopyButton } from './copy-button'
import { EntryInitial } from './entry-initial'
import { TagChip } from './tag-input'

export function LoginList({ entries, sort, timeout, onEdit, onToggleFavorite }: { entries: Entry[]; sort: LoginSort; timeout: number; onEdit: (entry: Entry) => void; onToggleFavorite?: (entry: Entry) => void }) {
  return <div className="flex flex-col gap-6">
    {groupLogins(entries, sort).map(group => <section key={group.label} aria-label={`Group ${group.label}`} className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</h2>
      <ul className="panel overflow-hidden">
        {group.entries.map(entry => <li key={entry.id} className="group flex min-w-0 items-center border-b border-border transition-colors last:border-0 hover:bg-secondary/70 focus-within:bg-secondary/70">
          <button type="button" onClick={() => onEdit(entry)} aria-label={`Open ${entry.title}, ${entry.username || 'no username'}`} className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
            <EntryInitial entry={entry} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-medium leading-tight">{entry.title}</span>
              <span className="truncate text-sm text-muted-foreground">{entry.username || loginDomain(entry.url) || 'No username'}</span>
              {entry.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1.5">{entry.tags.slice(0, 3).map(tag => <TagChip key={tag}>{tag}</TagChip>)}{entry.tags.length > 3 && <TagChip>{`+${entry.tags.length - 3}`}</TagChip>}</span>}
            </span>
            <span className="hidden w-28 shrink-0 truncate text-sm text-muted-foreground xl:block">{entry.category}</span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 pr-2">
            <button type="button" aria-pressed={entry.favorite} aria-label={entry.favorite ? `Remove ${entry.title} from favorites` : `Add ${entry.title} to favorites`} disabled={!onToggleFavorite} onClick={() => onToggleFavorite?.(entry)} className={cn('flex size-11 items-center justify-center rounded-lg outline-none transition-[color,transform] hover:text-primary focus-visible:ring-2 focus-visible:ring-primary active:scale-90 disabled:pointer-events-none', entry.favorite ? 'text-primary' : 'text-muted-foreground/60')}><Star className="size-4" fill={entry.favorite ? 'currentColor' : 'none'} /></button>
            <CopyButton compact className="hidden sm:inline-flex" value={entry.username} label="username" context={`${entry.title}, ${entry.username}`} timeout={timeout} />
            <CopyButton compact value={entry.password} label="password" context={`${entry.title}, ${entry.username}`} password timeout={timeout} />
          </div>
        </li>)}
      </ul>
    </section>)}
  </div>
}
