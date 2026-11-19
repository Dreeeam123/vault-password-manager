'use client'

import { useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Clock3, Coffee, Copy, DoorOpen, ExternalLink, HardDrive, KeyRound, Laptop, LockKeyhole, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PasswordInput, StrengthMeter } from './password-input'
import { AppearancePicker } from './appearance-picker'
import { StorageStatus } from './storage-status'
import type { VaultController } from '@/hooks/use-vault'
import { AUTO_LOCK_OPTIONS, CLIPBOARD_OPTIONS, messageOf, type Settings } from '@/lib/types'
import { APP_VERSION, COPYRIGHT } from '@/lib/about'
import { isDesktop } from '@/lib/native'
import { Capacitor } from '@capacitor/core'
import { ExportDialog } from './export-dialog'
import { VaultSelect } from './vault-select'

function SettingRow({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <div className="flex flex-col items-stretch justify-between gap-4 border-b border-border p-5 last:border-0 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><span className="mt-1 text-muted-foreground">{icon}</span><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div></div><div className="shrink-0 self-end sm:self-center">{children}</div></div>
}
export function SettingsView({ vault, offlineReady, onImport }: { vault: VaultController; offlineReady: boolean; onImport: () => void }) {
  const settings = vault.data!.settings
  const native = Capacitor.isNativePlatform()
  const [exportOpen, setExportOpen] = useState(false)
  const [dialog, setDialog] = useState<'password' | 'verify' | 'wipe' | null>(null)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const close = () => { setDialog(null); setCurrent(''); setPassword(''); setConfirmation(''); setError('') }
  async function update(patch: Partial<Settings>) { try { await vault.setSettings({ ...settings, ...patch }); toast.success('Settings saved securely.') } catch (error) { toast.error(messageOf(error)) } }
  return <div className="flex flex-col gap-8"><header><h1 className="page-heading">Settings</h1><p className="mt-2 text-sm text-muted-foreground">Security, backups, and your personal style.</p></header>
    <section><h2 className="eyebrow mb-4">Security</h2><div className="panel overflow-hidden">
      <SettingRow icon={<KeyRound className="size-5" />} title="Master password" description="The only key to your vault."><Button variant="outline" onClick={() => setDialog('password')}>Change<ChevronRight data-icon="inline-end" /></Button></SettingRow>
      <SettingRow icon={<ShieldCheck className="size-5" />} title="Practice your master password" description="Type it once in a while so you never forget it."><Button variant="outline" onClick={() => setDialog('verify')}>Test<ChevronRight data-icon="inline-end" /></Button></SettingRow>
      <SettingRow icon={<Clock3 className="size-5" />} title="Auto-lock" description="Lock after a little time without activity."><VaultSelect label="Auto-lock time" value={String(settings.autoLock)} disabled={vault.busy} onChange={value => void update({ autoLock: Number(value) as Settings['autoLock'] })} options={AUTO_LOCK_OPTIONS.map(value => ({ value: String(value), label: value === 0 ? 'Never' : `${value} ${value === 1 ? 'minute' : 'minutes'}` }))} /></SettingRow>
      <SettingRow icon={<DoorOpen className="size-5" />} title="Lock when leaving the app" description="What happens when you switch apps or tabs. File pickers still respect the inactivity timeout."><VaultSelect label="Lock when leaving the app" value={settings.lockOnLeave} disabled={vault.busy} onChange={value => void update({ lockOnLeave: value as Settings['lockOnLeave'] })} options={[{ value: 'immediately', label: 'Immediately' }, { value: 'auto-lock', label: settings.autoLock === 0 ? 'After the auto-lock time (off)' : `After ${settings.autoLock} ${settings.autoLock === 1 ? 'minute' : 'minutes'}` }, { value: 'never', label: 'Never' }]} /></SettingRow>
      <SettingRow icon={<Copy className="size-5" />} title="Clear clipboard" description="Clear after copying and whenever the vault locks. Never only disables the timer."><VaultSelect label="Clipboard timeout" value={String(settings.clipboardTimeout)} disabled={vault.busy} onChange={value => void update({ clipboardTimeout: Number(value) as Settings['clipboardTimeout'] })} options={CLIPBOARD_OPTIONS.map(value => ({ value: String(value), label: value === 0 ? 'Never' : `${value} seconds` }))} /></SettingRow>
      <div className="flex items-start gap-3 bg-primary/5 p-5 text-sm leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>{settings.lockOnLeave === 'never' && settings.autoLock === 0 ? 'Your vault stays unlocked until you lock it yourself. Anyone with this device can read it meanwhile.' : settings.lockOnLeave === 'immediately' ? 'Locks as soon as you leave the app. ' : `Stays unlocked for up to ${settings.autoLock > 0 ? `${settings.autoLock} ${settings.autoLock === 1 ? 'minute' : 'minutes'}` : 'a while'} after you leave or close the app. `}{native ? ' Remembered sessions use Android Keystore encryption. Screenshot protection is enabled.' : ' Closing or reloading the app always requires your master password; decryption keys are never saved.'} Clipboard clearing is best-effort.</p></div>
    </div></section>
    <section><h2 className="eyebrow mb-4">Appearance</h2><div className="panel p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-sm font-medium">Mode</h3><p className="mt-1 text-sm text-muted-foreground">Light, dark, or follow your device.</p></div><ToggleGroup value={[settings.theme]} onValueChange={values => { if (values[0]) vault.setLook({ theme: values[0] as Settings['theme'] }) }}><ToggleGroupItem value="light" aria-label="Light theme"><Sun className="size-4" />Light</ToggleGroupItem><ToggleGroupItem value="dark" aria-label="Dark theme"><Moon className="size-4" />Dark</ToggleGroupItem><ToggleGroupItem value="system" aria-label="System theme"><Laptop className="size-4" />System</ToggleGroupItem></ToggleGroup></div><AppearancePicker value={settings.appearance} onChange={appearance => vault.setLook({ appearance })} /></div></section>
    <section><h2 className="eyebrow mb-4">Backups & exports</h2><div className="panel overflow-hidden">
      <SettingRow icon={<ArrowDownToLine className="size-5" />} title="Encrypted backup" description="Every new export is protected with your current master password."><Button variant="outline" disabled={vault.busy} onClick={() => setExportOpen(true)}>Export backup<ArrowDownToLine data-icon="inline-end" /></Button></SettingRow>
      <SettingRow icon={<ArrowUpFromLine className="size-5" />} title="Restore a backup" description="Import a .vault file and replace this device’s vault."><Button variant="outline" disabled={vault.busy} onClick={onImport}>Import<ArrowUpFromLine data-icon="inline-end" /></Button></SettingRow>
    </div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{settings.lastBackupAt ? `Last backup export: ${new Date(settings.lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'No backup exported yet.'} Keep a password-protected copy outside this device. There is no automatic cloud backup.</p></section>
    <section><h2 className="eyebrow mb-4">On this device</h2><div className="panel overflow-hidden"><StorageStatus /><SettingRow icon={<Trash2 className="size-5" />} title="Erase local vault" description="Deletes this device’s entries and settings, not your exported files."><Button variant="outline" disabled={vault.busy} onClick={() => setDialog('wipe')}>Erase data</Button></SettingRow></div></section>
    {exportOpen && <ExportDialog vault={vault} onClose={() => setExportOpen(false)} />}
    <div className="panel flex items-start gap-4 p-6"><HardDrive className="mt-1 size-6 shrink-0 text-primary" /><div><h2 className="font-medium">Local is a feature. Not a limitation.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">AES-256-GCM · PBKDF2-SHA256 · 600,000 iterations<br />No accounts. No tracking. Vault data stays on this device. The optional support link opens an external website.</p><p className="mt-3 flex items-center gap-2 text-sm text-primary"><ShieldCheck className="size-4" />{native ? `Android app · bundled offline · v${APP_VERSION}` : isDesktop() ? `Windows app · bundled offline · v${APP_VERSION}` : offlineReady ? `Web app v${APP_VERSION} · offline cache ready` : `Web app v${APP_VERSION} · offline cache available in production`}</p></div></div>
    <section aria-labelledby="support-heading"><h2 id="support-heading" className="eyebrow mb-4">Support Vault</h2><div className="panel overflow-hidden"><SettingRow icon={<Coffee className="size-5" />} title="Buy me a coffee" description="Completely optional. Supporting development unlocks nothing; every feature stays available to everyone."><a className={buttonVariants({ variant: 'outline' })} href="https://buymeacoffee.com/amirzafer79" target="_blank" rel="noopener noreferrer" aria-label="Buy me a coffee (opens in your browser)">Buy me a coffee<ExternalLink data-icon="inline-end" /></a></SettingRow></div></section>
    <p className="text-center text-xs text-muted-foreground/70">{COPYRIGHT}</p>
    {dialog === 'verify' && <Dialog open onOpenChange={value => { if (!value && !vault.busy) close() }}><DialogContent><DialogHeader><DialogTitle>Do you still know it?</DialogTitle><DialogDescription>Nothing changes. Vault only checks whether this is your current master password.</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-5" onSubmit={async event => { event.preventDefault(); setError(''); try { await vault.verifyPassword(current); toast.success('Correct. Your master password works.'); close() } catch (error) { setCurrent(''); setError(messageOf(error)) } }}>
        <Field><FieldLabel htmlFor="verify-master">Master password</FieldLabel><PasswordInput id="verify-master" value={current} onChange={event => setCurrent(event.target.value)} required maxLength={1024} autoComplete="off" /></Field>
        {error && <p role="alert" className="text-sm">{error}</p>}<Button type="submit" disabled={vault.busy || !current}>{vault.busy ? 'Checking…' : 'Check password'}</Button>
      </form>
    </DialogContent></Dialog>}
    {(dialog === 'password' || dialog === 'wipe') && <Dialog open onOpenChange={value => { if (!value && !vault.busy) close() }}><DialogContent><DialogHeader><DialogTitle>{dialog === 'password' ? 'A new key for your vault.' : 'Erase your local vault?'}</DialogTitle><DialogDescription>{dialog === 'password' ? 'Your entire vault will be re-encrypted. Existing encrypted backups still need their original password. Unprotected backups and text exports remain readable without any password.' : 'This permanently deletes entries and settings on this device. Saved backup files are not deleted. This cannot be undone.'}</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-5" onSubmit={async event => { event.preventDefault(); setError(''); try {
        if (dialog === 'wipe') { if (confirmation !== 'DELETE') throw new Error('Type DELETE to confirm.'); await vault.wipe() }
        else { if (password !== confirmation) throw new Error('New passwords do not match.'); await vault.changePassword(current, password); toast.success('Master password changed. Export a new backup.') }
        close()
      } catch (error) { setCurrent(''); setPassword(''); setConfirmation(''); setError(messageOf(error)) } }}>
        <FieldGroup>{dialog === 'password' ? <><Field><FieldLabel htmlFor="current-master">Current master password</FieldLabel><PasswordInput id="current-master" value={current} onChange={event => setCurrent(event.target.value)} required maxLength={1024} autoComplete="off" /></Field><Field><FieldLabel htmlFor="new-master">New master password</FieldLabel><PasswordInput id="new-master" value={password} onChange={event => setPassword(event.target.value)} required minLength={12} maxLength={1024} autoComplete="off" /><StrengthMeter password={password} /></Field><Field><FieldLabel htmlFor="confirm-new">Confirm new master password</FieldLabel><PasswordInput id="confirm-new" value={confirmation} onChange={event => setConfirmation(event.target.value)} required maxLength={1024} autoComplete="off" /></Field></> : <Field><FieldLabel htmlFor="confirm-wipe">Type DELETE to confirm</FieldLabel><Input id="confirm-wipe" value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="off" /></Field>}</FieldGroup>
        {error && <p role="alert" className="text-sm">{error}</p>}<Button type="submit" disabled={vault.busy || (dialog === 'wipe' && confirmation !== 'DELETE')}>{vault.busy ? 'Working securely…' : dialog === 'password' ? 'Change master password' : 'Permanently erase vault'}</Button>
      </form>
    </DialogContent></Dialog>}
  </div>
}
