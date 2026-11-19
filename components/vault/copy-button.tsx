'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputGroupButton } from '@/components/ui/input-group'
import { copySecret } from '@/lib/clipboard'

export function CopyButton({ value, label, timeout = 30, inInput = false, password = false, compact = false, context, className }: {
  value: string
  label: string
  timeout?: number
  inInput?: boolean
  password?: boolean
  compact?: boolean
  context?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(reset.current) } }, [])
  const Control = inInput ? InputGroupButton : Button
  const Icon = copied ? Check : password ? KeyRound : Copy
  const accessibleLabel = `Copy ${label}${context ? ` for ${context}` : ''}`
  return <Control type="button" variant={inInput || compact ? 'ghost' : 'outline'} size={inInput || compact ? 'icon-sm' : 'sm'} className={className} disabled={!value} title={accessibleLabel} aria-label={copied ? `${label} copied` : accessibleLabel} onClick={async () => {
    const success = await copySecret(value, timeout)
    if (!success || !alive.current) return
    setCopied(true)
    clearTimeout(reset.current)
    reset.current = setTimeout(() => setCopied(false), 2000)
  }}><Icon data-icon="inline-start" />{!inInput && <span className={compact ? 'sr-only' : undefined} aria-live="polite">{copied ? 'Copied' : label}</span>}</Control>
}
