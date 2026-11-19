import { BriefcaseBusiness, FolderClosed, ShoppingBag, UserRound, Users, Wallet } from 'lucide-react'
import { serviceForCategory } from '@/lib/services'
import type { Entry } from '@/lib/types'

const icons = { Personal: UserRound, Work: BriefcaseBusiness, Finance: Wallet, Social: Users, Shopping: ShoppingBag, Other: FolderClosed }
export function CategoryIcon({ category, icon, className = 'size-5' }: { category: Entry['category']; icon?: string; className?: string }) {
  if (icon && /^[a-z0-9_-]{1,100}$/.test(icon)) return <svg viewBox="0 0 24 24" className={className} aria-hidden="true"><use href={`/brands/catalog.svg#${icon}`} /></svg>
  const service = serviceForCategory(category)
  if (service) return <img src={`/brands/${service.slug}.svg`} width={24} height={24} alt="" className={className} />
  const Icon = icons[category as keyof typeof icons] ?? FolderClosed
  return <Icon className={className} aria-hidden="true" />
}
