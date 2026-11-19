'use client'

import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { passwordStrength } from '@/lib/generator'
import { cn } from '@/lib/utils'

export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return <InputGroup>
    <InputGroupInput {...props} type={visible ? 'text' : 'password'} spellCheck={false} autoCapitalize="none" autoCorrect="off" />
    <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Reveal password'}>{visible ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon>
  </InputGroup>
}
export function StrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password)
  return <div className="flex flex-col gap-2" aria-label={`Password strength: ${strength.label}`}>
    <div className="flex gap-1.5">{[1, 2, 3, 4].map(value => <div key={value} className={cn('h-1 flex-1 rounded-full bg-secondary', value <= strength.score && 'bg-primary')} />)}</div>
    <div className="flex justify-between text-sm text-muted-foreground"><span>{password ? strength.label : 'Make it long. Make it yours.'}</span><span>12+ characters</span></div>
  </div>
}
