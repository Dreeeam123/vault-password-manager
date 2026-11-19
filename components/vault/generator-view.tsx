'use client'

import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, Plus, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { DEFAULT_GENERATOR, generatePassword, generatePassphrase, passphraseBits, type GeneratorOptions } from '@/lib/generator'
import { copySecret } from '@/lib/clipboard'

export function GeneratorView({ timeout, onUse }: { timeout: number; onUse: (password: string) => void }) {
  const [mode, setMode] = useState('password')
  const [options, setOptions] = useState(DEFAULT_GENERATOR)
  const [words, setWords] = useState(10)
  const [value, setValue] = useState(() => generatePassword())
  const [reveal, setReveal] = useState(false)
  const regenerate = (next = options, nextMode = mode, nextWords = words) => setValue(nextMode === 'password' ? generatePassword(next) : generatePassphrase(nextWords))
  function changeOptions(next: GeneratorOptions) { setOptions(next); regenerate(next) }
  return <div className="flex flex-col gap-8"><header><p className="mb-2 text-sm text-muted-foreground">Let randomness do the heavy lifting.</p><h1 className="page-heading">Stronger by chance.</h1><p className="mt-3 text-sm text-muted-foreground">Unpredictable passwords. One less thing to think about.</p></header>
    <ToggleGroup value={[mode]} onValueChange={values => { if (values[0]) { const next = String(values[0]); setMode(next); regenerate(options, next) } }}><ToggleGroupItem value="password">Password</ToggleGroupItem><ToggleGroupItem value="passphrase">Passphrase</ToggleGroupItem></ToggleGroup>
    <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-border px-6 py-4"><span className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" />Freshly generated. Just for you.</span><Button variant="ghost" size="icon" aria-label={reveal ? 'Hide generated password' : 'Reveal generated password'} onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff /> : <Eye />}</Button></div><div className="flex min-h-40 items-center justify-center px-6 py-8"><p className="break-all text-center font-mono text-2xl leading-relaxed tracking-wide text-primary md:text-3xl" aria-label={reveal ? undefined : 'Generated password is hidden'}>{reveal ? value : '•••• •••• •••• ••••'}</p></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4"><span className="flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="size-4 text-primary" />{mode === 'passphrase' ? `${passphraseBits(words)} bits of entropy` : `${options.length} random characters`}</span><div className="flex gap-2"><Button variant="outline" onClick={() => regenerate()} aria-label="Generate another password"><RefreshCw /></Button><Button onClick={() => void copySecret(value, timeout)}><Copy data-icon="inline-start" />Copy password</Button></div></div></section>
    <section className="panel p-6 md:p-8"><h2 className="section-heading mb-7">Make it your own</h2><FieldGroup>
      <Field><div className="flex items-center justify-between"><FieldLabel id="length-label">{mode === 'password' ? 'Password length' : 'Number of words'}</FieldLabel><span className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-primary">{mode === 'password' ? options.length : words}</span></div><div className="py-4"><Slider aria-labelledby="length-label" value={[mode === 'password' ? options.length : words]} min={mode === 'password' ? 8 : 6} max={mode === 'password' ? 64 : 16} step={1} onValueChange={value => { const n = Array.isArray(value) ? value[0] : value; if (mode === 'password') changeOptions({ ...options, length: n }); else { setWords(n); regenerate(options, mode, n) } }} /></div><div className="flex justify-between text-sm text-muted-foreground"><span>{mode === 'password' ? 8 : 6}</span><span>{mode === 'password' ? 64 : 16}</span></div></Field>
      {mode === 'password' && (['uppercase', 'lowercase', 'numbers', 'symbols'] as const).map((key, index) => <Field orientation="horizontal" key={key} className="min-h-12 border-t border-border pt-4"><FieldLabel htmlFor={`gen-${key}`}><span className="flex flex-col gap-1"><span>{['Uppercase letters', 'Lowercase letters', 'Numbers', 'Symbols'][index]}</span><span className="font-mono font-normal text-muted-foreground">{['A–Z', 'a–z', '0–9', '! @ # $ %'][index]}</span></span></FieldLabel><Switch id={`gen-${key}`} checked={options[key]} disabled={options[key] && ['uppercase', 'lowercase', 'numbers', 'symbols'].filter(k => options[k as keyof GeneratorOptions] === true).length === 1} onCheckedChange={checked => changeOptions({ ...options, [key]: checked })} /></Field>)}
    </FieldGroup></section>
    <Button variant="outline" onClick={() => onUse(value)}><Plus data-icon="inline-start" />Use in a new login</Button><p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Check className="size-4 shrink-0" />Generated on your device using cryptographically secure randomness.</p>
  </div>
}
