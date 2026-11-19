'use client'

import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, Fingerprint, HardDrive, KeyRound, LockKeyhole, ShieldCheck, Upload, WifiOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PasswordInput, StrengthMeter } from './password-input'
import type { VaultController } from '@/hooks/use-vault'
import { messageOf } from '@/lib/types'
import { COPYRIGHT } from '@/lib/about'

export function AuthScreen({ vault, onImport }: { vault: VaultController; onImport: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [understood, setUnderstood] = useState(false)
  const returning = vault.hasVault
  return <motion.div initial={{ opacity: .35, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18, ease: [.2, .7, .3, 1] }} className="flex flex-col gap-8 lg:gap-10">
    <div className="flex flex-col gap-3"><div className="flex items-center gap-2 text-sm text-primary"><span className="size-1.5 rounded-full bg-primary" />YOUR PRIVATE CORNER OF THE INTERNET</div>
      <h1 className="text-balance text-4xl font-semibold leading-[1.15] tracking-[-0.055em] lg:text-5xl">Your passwords.<br /><span className="text-muted-foreground">Yours alone.</span></h1>
      <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground">A safer home for your digital life. No cloud, no accounts,<br className="hidden md:block" /> no one looking over your shoulder.</p>
    </div>
    <div className="grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[1fr_0.88fr]">
      <section className="p-6 sm:p-8 lg:p-9">
        <div className="flex flex-col gap-2"><div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><KeyRound className="size-5" /></div><h2 className="text-2xl font-semibold tracking-tight">{returning ? 'Welcome back.' : 'Make yourself secure.'}</h2><p className="text-sm leading-relaxed text-muted-foreground">{returning ? 'Your vault is locked. Only you hold the key.' : 'One master password. Everything else, protected.'}</p></div>
        <form className="mt-7 flex flex-col gap-5" onSubmit={async event => {
          event.preventDefault(); setError('')
          if (!returning && password !== confirm) { setError('Your passwords do not match.'); return }
          try { if (returning) await vault.unlock(password); else await vault.create(password); setPassword(''); setConfirm('') }
          catch (error) { setError(messageOf(error)); setPassword(''); setConfirm('') }
        }}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="master">Master password</FieldLabel><PasswordInput id="master" value={password} placeholder={returning ? 'Enter your master password' : 'Create a strong password'} onChange={event => setPassword(event.target.value)} required minLength={returning ? 1 : 12} maxLength={1024} autoComplete="off" />{!returning && <StrengthMeter password={password} />}</Field>
            {!returning && <Field><FieldLabel htmlFor="confirm-master">Confirm master password</FieldLabel><PasswordInput id="confirm-master" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Once more, just to be sure" required autoComplete="off" maxLength={1024} /></Field>}
          </FieldGroup>
          {!returning && <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={understood} onChange={event => setUnderstood(event.target.checked)} required /><span>I understand my master password <span className="text-foreground">cannot be recovered</span>. If I lose it, I lose access to my vault.</span></label>}
          {error && <Alert><AlertDescription role="alert">{error}</AlertDescription></Alert>}
          <Button type="submit" size="lg" className="w-full" disabled={vault.busy || (!returning && !understood)}>{vault.busy ? 'Securing your vault…' : returning ? 'Unlock your vault' : 'Create your vault'}<ArrowRight data-icon="inline-end" /></Button>
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-3.5" />Encrypted before it ever touches your device.</p>
        </form>
      </section>
      <aside className="hidden border-l border-border bg-background/35 p-9 lg:flex lg:flex-col lg:justify-between lg:gap-10">
        <div className="flex justify-center py-8"><div className="vault-door"><div className="vault-door-inner"><Fingerprint className="size-20 text-primary" strokeWidth={1} /></div></div></div>
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3"><HardDrive className="mt-1 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-medium">Your device. Your data.</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Everything stays right here. Always.</p></div></div>
          <div className="flex items-start gap-3"><ShieldCheck className="mt-1 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-medium">Strong by design.</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">AES-256 encryption. Zero compromises on privacy.</p></div></div>
          <div className="flex items-start gap-3"><WifiOff className="mt-1 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-medium">Offline is the whole point.</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">No connection? Nothing changes.</p></div></div>
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-5 text-sm text-muted-foreground"><Check className="size-4 text-primary" /> No sign-up. No subscription. Just yours.</div>
      </aside>
    </div>
    <button className="flex min-h-16 items-center justify-between rounded-xl border border-dashed border-border px-5 text-left transition-colors hover:bg-card" onClick={onImport}><span className="flex items-center gap-3"><Upload className="size-5 text-muted-foreground" /><span className="text-sm"><span className="font-medium">Already have a vault?</span><span className="ml-1.5 hidden text-muted-foreground sm:inline">Pick up where you left off.</span><span className="mt-0.5 block text-muted-foreground sm:hidden">Restore a backup file</span></span></span><span className="flex items-center gap-2 text-sm text-primary"><span className="hidden sm:inline">Import backup</span><ArrowUpRight className="size-4" /></span></button>
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground lg:hidden"><ShieldCheck className="size-4" />On-device encryption. No cloud. Fully offline.</p>
    <p className="text-center text-xs text-muted-foreground/70">{COPYRIGHT}</p>
  </motion.div>
}
