'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ChevronRight, Search, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { CategoryIcon } from './category-icon'
import type { Entry } from '@/lib/types'

export type BrandIcon = { slug: string; title: string; aliases: string[] }
const popular = ['google', 'apple', 'discord', 'instagram', 'steam', 'github', 'spotify', 'netflix', 'reddit', 'twitch', 'paypal', 'proton']
async function loadCatalog(url: string): Promise<BrandIcon[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Icon library unavailable')
  return response.json()
}
export function ServicePicker({ selected, category, onSelect, disabled }: {
  selected?: string; category: Entry['category']; onSelect: (icon?: BrandIcon) => void; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(48)
  const { data, error, isLoading, mutate } = useSWR(open ? '/brands/catalog.json' : null, loadCatalog, { revalidateOnFocus: false, revalidateOnReconnect: false })
  const matches = useMemo(() => {
    if (!data) return []
    const term = query.trim().toLowerCase()
    if (term) return data.filter(icon => [icon.title, icon.slug, ...icon.aliases].some(name => name.toLowerCase().includes(term)))
    return [...data].sort((a, b) => (popular.indexOf(a.slug) < 0 ? 999 : popular.indexOf(a.slug)) - (popular.indexOf(b.slug) < 0 ? 999 : popular.indexOf(b.slug)))
  }, [data, query])
  function choose(icon?: BrandIcon) { onSelect(icon); setOpen(false) }
  return <Dialog open={open} onOpenChange={value => { setOpen(value); setQuery(''); setLimit(48) }}>
    <DialogTrigger render={<Button type="button" variant="outline" disabled={disabled} className="h-auto w-full justify-between py-3" />}>
      <span className="flex items-center gap-3"><CategoryIcon category={category} icon={selected} /><span className="flex flex-col items-start gap-1"><span>Login icon</span><span className="text-sm font-normal text-muted-foreground">{selected ? 'Change selected icon' : 'Choose from the offline library'}</span></span></span><ChevronRight data-icon="inline-end" />
    </DialogTrigger>
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
      <DialogHeader><DialogTitle>Find your icon</DialogTitle><DialogDescription>Thousands of brands. Stored in the app, never looked up online.</DialogDescription></DialogHeader>
      <InputGroup><InputGroupInput aria-label="Search app icons" placeholder="Search apps, games, services…" value={query} onChange={event => { setQuery(event.target.value); setLimit(48) }} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
      <div className="flex items-center justify-between"><p role="status" className="text-sm text-muted-foreground">{isLoading ? 'Loading local library…' : `${matches.length.toLocaleString()} icons`}</p><Button variant="ghost" size="sm" onClick={() => choose()}>Reset icon</Button></div>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {error ? <div className="flex flex-col items-center gap-3 py-6"><p>Could not load the icon library.</p><Button variant="outline" onClick={() => void mutate()}>Try again</Button></div> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{matches.slice(0, limit).map(icon => <Button key={icon.slug} type="button" variant={selected === icon.slug ? 'secondary' : 'outline'} aria-pressed={selected === icon.slug} className="h-auto min-h-24 min-w-0 flex-col py-4" onClick={() => choose(icon)}><CategoryIcon category="Other" icon={icon.slug} /><span className="w-full truncate">{icon.title}</span></Button>)}</div>}
        {!isLoading && !error && !matches.length && <p className="py-8 text-center text-sm text-muted-foreground">No match yet. Try a shorter name or use initials.</p>}
        {matches.length > limit && <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setLimit(current => current + 48)}>Show more</Button>}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Offline icons by Simple Icons. Brand trademarks apply.</p>
    </DialogContent>
  </Dialog>
}
