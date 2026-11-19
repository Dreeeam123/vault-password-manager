import type { Entry } from '@/lib/types'
import { serviceForCategory } from '@/lib/services'
import { CategoryIcon } from './category-icon'

export function EntryInitial({ entry }: { entry: Entry }) {
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-base font-semibold text-foreground">
    {entry.icon || serviceForCategory(entry.category)
      ? <CategoryIcon category={entry.category} icon={entry.icon} className="size-6" />
      : entry.title.slice(0, 2).toUpperCase()}
  </span>
}
