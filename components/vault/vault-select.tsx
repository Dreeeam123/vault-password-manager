'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function VaultSelect({ id, label, value, onChange, options, disabled, className }: {
  id?: string; label: string; value: string; onChange: (value: string) => void
  options: { value: string; label: string }[]; disabled?: boolean; className?: string
}) {
  return <Select items={options} value={value} disabled={disabled} onValueChange={value => { if (value !== null) onChange(value) }}>
    <SelectTrigger id={id} aria-label={label} className={className}><SelectValue /></SelectTrigger>
    <SelectContent alignItemWithTrigger={false} className="max-h-[min(18rem,var(--available-height))]"><SelectGroup>
      {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
    </SelectGroup></SelectContent>
  </Select>
}
