'use client'

import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_TAGS = 20
const MAX_LENGTH = 60

export function TagChip({ children, className }: { children: string; className?: string }) {
  return <span className={cn('tag-chip', className)}>{children}</span>
}

export function TagInput({ id, value, suggestions, onChange, disabled }: { id: string; value: string[]; suggestions: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const listId = useId()
  const taken = new Set(value.map(tag => tag.toLocaleLowerCase()))
  const needle = draft.trim().toLocaleLowerCase()
  const matches = suggestions.filter(tag => !taken.has(tag.toLocaleLowerCase()) && (!needle || tag.toLocaleLowerCase().includes(needle))).slice(0, 8)
  const full = value.length >= MAX_TAGS

  function add(raw: string) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH)
    if (!tag || full || taken.has(tag.toLocaleLowerCase())) { setDraft(''); return }
    onChange([...value, tag])
    setDraft('')
  }
  function remove(tag: string) { onChange(value.filter(item => item !== tag)) }

  return <div className="flex flex-col gap-2">
    <div className={cn('tag-field', focused && 'tag-field-focused', disabled && 'opacity-50')} onClick={() => document.getElementById(id)?.focus()}>
      {value.map(tag => <span key={tag} className="tag-chip tag-chip-removable">
        <span className="truncate">{tag}</span>
        <button type="button" aria-label={`Remove tag ${tag}`} disabled={disabled} className="tag-chip-remove" onClick={event => { event.stopPropagation(); remove(tag) }}><X className="size-3" /></button>
      </span>)}
      <input
        id={id}
        value={draft}
        disabled={disabled || full}
        placeholder={value.length ? (full ? 'Tag limit reached' : 'Add another…') : 'e.g. banking, shared, 2fa'}
        maxLength={MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-controls={matches.length ? listId : undefined}
        aria-describedby={`${id}-hint`}
        className="min-w-24 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (draft.trim()) add(draft) }}
        onChange={event => {
          const next = event.target.value
          if (next.includes(',')) { next.split(',').forEach(part => { if (part.trim()) add(part) }); return }
          setDraft(next)
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') { event.preventDefault(); add(draft) }
          else if (event.key === 'Backspace' && !draft && value.length) remove(value[value.length - 1])
        }}
      />
    </div>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">Press Enter or type a comma to add a tag.</p>
    {focused && matches.length > 0 && <ul id={listId} aria-label="Existing tags" className="flex flex-wrap gap-2">
      {matches.map(tag => <li key={tag}>
        <button type="button" className="tag-chip tag-chip-suggest" onMouseDown={event => event.preventDefault()} onClick={() => add(tag)}><Plus className="size-3" />{tag}</button>
      </li>)}
    </ul>}
  </div>
}
