'use client'

// Design-mode edits can remove live DOM nodes before React reconciles them.
// Remount on Fast Refresh instead of reconciling that externally edited tree.
// @refresh reset

import { useEffect, useRef, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { ChevronRight, Fingerprint, HardDrive, HeartPulse, KeyRound, LockKeyhole, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { APP_VERSION } from '@/lib/about'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useVault, type VaultController } from '@/hooks/use-vault'
import { AuthScreen } from './auth-screen'
import { VaultView } from './vault-view'
import { GeneratorView } from './generator-view'
import { HealthView } from './health-view'
import { SettingsView } from './settings-view'
import { EntryDialog } from './entry-dialog'
import { ImportDialog } from './import-dialog'
import { AutofillPicker } from './autofill-picker'
import useSWR from 'swr'
import { AUTOFILL_REQUEST_KEY, cancelAutofill, getAutofillRequest } from '@/lib/autofill'
import { retryClipboardClear } from '@/lib/clipboard'
import type { Entry, Tab } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Capacitor } from '@capacitor/core'
import { dismissTopLayer, hapticTap, isDesktop, onBackButton } from '@/lib/native'

const tabs = [{ id: 'vault' as const, label: 'Vault', icon: KeyRound }, { id: 'generator' as const, label: 'Generator', icon: Sparkles }, { id: 'health' as const, label: 'Password health', mobile: 'Health', icon: HeartPulse }, { id: 'settings' as const, label: 'Settings', icon: Settings2 }]

function Workspace({ vault, tab, setTab, offlineReady, onImport }: { vault: VaultController; tab: Tab; setTab: (tab: Tab) => void; offlineReady: boolean; onImport: () => void }) {
  const [editor, setEditor] = useState<{ entry?: Entry; password?: string } | null>(null)
  return <><div key={tab} className="view-enter">
    {tab === 'vault' && <VaultView vault={vault} onAdd={() => setEditor({})} onEdit={entry => setEditor({ entry })} onHealth={() => setTab('health')} />}
    {tab === 'generator' && <GeneratorView timeout={vault.data!.settings.clipboardTimeout} onUse={password => setEditor({ password })} />}
    {tab === 'health' && <HealthView entries={vault.data!.entries} onEdit={entry => setEditor({ entry })} />}
    {tab === 'settings' && <SettingsView vault={vault} offlineReady={offlineReady} onImport={onImport} />}
  </div>{editor && <EntryDialog entry={editor.entry} initialPassword={editor.password} onClose={() => setEditor(null)} vault={vault} />}</>
}
export function VaultApp() {
  const vault = useVault()
  const [tab, setTab] = useState<Tab>('vault')
  const [privacy, setPrivacy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  useEffect(() => {
    window.addEventListener('focus', retryClipboardClear)
    if (Capacitor.isNativePlatform() || isDesktop()) setOfflineReady(true)
    else if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(() => setOfflineReady(true)).catch(() => setOfflineReady(false))
    }
    return () => window.removeEventListener('focus', retryClipboardClear)
  }, [])
  const ready = Boolean(vault.data)
  const { data: autofill } = useSWR(AUTOFILL_REQUEST_KEY, getAutofillRequest, { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false })
  const autofillRef = useRef(autofill)
  autofillRef.current = autofill
  useEffect(() => { setImportOpen(false) }, [vault.lockVersion])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [tab, ready])
  const switchTab = (next: Tab) => { if (next !== tab) { void hapticTap(); setTab(next) } }
  const backState = useRef({ tab, ready })
  backState.current = { tab, ready }
  useEffect(() => {
    const unsubscribe = onBackButton(() => {
      if (dismissTopLayer()) return true
      if (autofillRef.current) { void cancelAutofill(); return true }
      if (backState.current.ready && backState.current.tab !== 'vault') { setTab('vault'); return true }
      return false
    })
    return () => { void unsubscribe.then(remove => remove()) }
  }, [])
  return <MotionConfig reducedMotion="user"><div className="vault-shell min-h-dvh bg-background font-sans">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card/35 px-5 py-7 lg:flex">
      <div className="flex items-center gap-3 px-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Fingerprint className="size-7" strokeWidth={1.6} /></div><span className="text-[28px] font-semibold tracking-[-0.06em]">vault<span className="text-primary">.</span></span></div>
      <div className="panel mb-9 mt-8 flex items-center gap-3 rounded-xl p-3"><span className="flex size-9 items-center justify-center rounded-lg bg-secondary"><HardDrive className="size-4 text-muted-foreground" /></span><div><p className="text-sm font-medium">Personal vault</p><p className="mt-0.5 text-sm text-muted-foreground">Stored on this device</p></div></div>
      <p className="eyebrow mb-3 px-3">Workspace</p><nav className="flex flex-col gap-2" aria-label="Main navigation">{tabs.map(item => <button key={item.id} className="nav-item" data-active={ready ? tab === item.id : item.id === 'vault'} disabled={!ready} onClick={() => switchTab(item.id)} aria-current={ready && tab === item.id ? 'page' : undefined}><item.icon className="size-5" /><span>{item.label}</span>{ready && item.id === 'vault' && <span className="ml-auto text-sm">{vault.data!.entries.length}</span>}</button>)}</nav>
      <div className="mt-auto flex items-center justify-between px-3 text-sm text-muted-foreground"><span>Version {APP_VERSION}</span><button className="flex min-h-8 items-center gap-1.5 hover:text-foreground" onClick={() => setPrivacy(true)}><ShieldCheck className="size-4" />Security</button></div>
    </aside>
    <div className="lg:pl-60">
      <header className="app-header flex min-h-16 items-center justify-between border-b border-border px-5 md:min-h-20 md:px-9 lg:px-12"><div className="flex items-center gap-2.5 lg:hidden"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm"><Fingerprint className="size-5" strokeWidth={1.8} /></span><span className="text-2xl font-semibold tracking-[-0.06em]">vault<span className="text-primary">.</span></span></div><div className="hidden items-center gap-3 text-sm text-muted-foreground lg:flex"><HardDrive className="size-4" /><span>Personal vault</span><ChevronRight className="size-3.5" /><span className="text-foreground">{ready ? tabs.find(item => item.id === tab)?.label : vault.hasVault ? 'Welcome back' : 'Get started'}</span></div><div className="flex items-center gap-4">{ready && <Button variant="outline" onClick={vault.lock} aria-label="Lock vault"><LockKeyhole data-icon="inline-start" /><span className="hidden sm:inline">Lock vault</span></Button>}{!ready && <span className="hidden size-9 items-center justify-center rounded-full border border-border bg-card sm:flex"><LockKeyhole className="size-4 text-muted-foreground" /></span>}</div></header>
      <main className="app-main mx-auto max-w-6xl px-5 pt-6 md:px-9 md:pt-10 lg:px-12 lg:pb-12 lg:pt-11">
        {vault.isLoading ? <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-4"><Fingerprint className="size-10 text-primary" /><p className="text-sm text-muted-foreground">Opening vault…</p></div> : vault.storageError ? <div role="alert" className="panel p-6"><h1 className="page-heading">Your vault could not be opened.</h1><p className="mt-4 text-muted-foreground">Local storage is blocked or did not respond. Close other Vault tabs, then try again. In a preview, you can also try opening it in a new tab.</p><p className="mt-4 text-sm text-muted-foreground">Do not clear browser data or reset the vault. This error does not mean your saved passwords are gone. A different preview address or browser can have separate storage.</p><Button className="mt-5" onClick={() => location.reload()}>Try again</Button></div> : ready && autofill ? <AutofillPicker vault={vault} request={autofill} /> : ready ? <Workspace vault={vault} tab={tab} setTab={setTab} offlineReady={offlineReady} onImport={() => setImportOpen(true)} /> : <AuthScreen key={`${vault.hasVault ? 'unlock' : 'create'}-${vault.lockVersion}`} vault={vault} onImport={() => setImportOpen(true)} />}
      </main>
    </div>
    <nav aria-label="Mobile navigation" className="tab-bar" hidden={Boolean(autofill) || !ready}>{tabs.map(item => <button key={item.id} onClick={() => switchTab(item.id)} disabled={!ready} aria-current={ready && tab === item.id ? 'page' : undefined} className={cn('flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[calc(var(--radius-6)-6px)] text-xs font-medium outline-none transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-primary active:scale-[.97] disabled:opacity-45', (ready ? tab === item.id : item.id === 'vault') ? 'text-primary' : 'text-muted-foreground')}><item.icon className="size-5" strokeWidth={1.8} /><span>{item.mobile ?? item.label}</span></button>)}</nav>
    <Dialog open={privacy} onOpenChange={setPrivacy}><DialogContent><DialogHeader><DialogTitle>How Vault protects your data</DialogTitle><DialogDescription>What the encryption covers, and its limits.</DialogDescription></DialogHeader><div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground"><p>Vault encrypts all entries and settings with AES-256-GCM before writing to IndexedDB. Your master password derives an AES-256 encryption key using Argon2id (64 MiB memory, 3 passes, 4 lanes). Older vaults made with PBKDF2 are upgraded automatically the next time you unlock with your master password.</p><p>Your master password is never saved. Web and Windows keep decryption keys in memory only. Android can remember a session when your lock settings allow it, encrypting the key with Android Keystore. Locking clears remembered sessions and drops decrypted data and key references. There is no account, analytics, or recovery service. If you turn on sync, the sync file is encrypted the same way as the vault.</p><p>Keep your device secure and export encrypted backups regularly. Browser extensions, malware, or an already-compromised device can access information while your vault is unlocked. JavaScript cannot guarantee physical memory erasure.</p><p>Clipboard erasure is best-effort, including on Android. The Android app uses native clipboard access, background locking and screenshot protection with a bundled WebView interface. All new backups are encrypted. Older unprotected backups and text exports still expose passwords to anyone who has the file and should be replaced. Vault has not been independently security-audited yet.</p></div></DialogContent></Dialog>
    {importOpen && <ImportDialog open vault={vault} onClose={() => setImportOpen(false)} />}
    <Toaster />
  </div></MotionConfig>
}
