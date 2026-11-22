'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate as mutateCache } from 'swr'
import { toast } from 'sonner'
import { CURRENT_KDF, deriveKey, decryptVault, encryptVault, envelopeSchema, newSalt, type Envelope, type Kdf } from '@/lib/crypto'
import { assertAttemptAllowed, commitRecord, failAttempt, getLook, getRecord, resetAttempts, saveLook, wipeRecord, type VaultRecord } from '@/lib/db'
import { emptyVault, messageOf, type Appearance, type VaultData, type Entry, type Settings } from '@/lib/types'
import { cacheLook, LOOK_KEY } from '@/lib/look'
import { clearClipboard, retryClipboardClear } from '@/lib/clipboard'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { saveExportFile } from '@/lib/backup'
import { syncAppIcon } from '@/lib/app-icon'
import { forgetSession, loadSession, rememberSession, touchSession } from '@/lib/session'
import { applySystemBars, hapticError, hapticImpact, hapticSuccess } from '@/lib/native'
import { parseImportBackup } from '@/lib/transfer'
import { deleteForever as purgeOne, emptyTrash as purgeAll, moveToTrash, purgeExpired, restoreFromTrash } from '@/lib/trash'
import { mergeVaults, sameContent } from '@/lib/sync'
import { chooseSyncFile, forgetSyncFile, readSyncFile, SYNC_KEY, syncFileName, SyncPasswordNeeded, syncSupported, writeSyncFile } from '@/lib/sync-file'
import { BIOMETRIC_KEY, disableBiometric, enableBiometric, unlockWithBiometric } from '@/lib/biometric'

type Session = { key: CryptoKey; record: VaultRecord; data: VaultData }
type Look = Pick<Settings, 'theme' | 'appearance'>
export function useVault() {
  const { data: stored, error: storageError, isLoading, mutate } = useSWR('vault-encrypted-record', getRecord, { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false })
  const [data, setData] = useState<VaultData | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockVersion, setLockVersion] = useState(0)
  const [restoring, setRestoring] = useState(true)
  const session = useRef<Session | null>(null)
  const rememberedKey = useRef<CryptoKey | null>(null)
  const inFlight = useRef(false)
  const idle = useRef<Promise<void>>(Promise.resolve())
  // Theme and mode apply on screen at once; the encrypted save follows in the background.
  const [lookDraft, setLookDraft] = useState<Partial<Look> | null>(null)
  const pendingLook = useRef<Partial<Look> | null>(null)
  const lookSave = useRef<Promise<void> | null>(null)
  const epoch = useRef(0)
  const pendingBackup = useRef<{ revision: string; at: string } | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)
  // File pickers and share sheets hide the page without the user leaving the app.
  // While one is open (and for a short grace period afterwards) background locking is paused.
  // The inactivity deadline still applies, including while a picker is open.
  const syncRun = useRef<Promise<unknown> | null>(null)
  const syncTimer = useRef<number | undefined>(undefined)
  const [syncStatus, setSyncStatus] = useState<{ at: number | null; error: string | null; needsPassword: boolean }>({ at: null, error: null, needsPassword: false })
  const { data: syncName, mutate: refreshSyncName } = useSWR(syncSupported() ? SYNC_KEY : null, syncFileName, { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false })
  const syncEnabled = useRef(false)
  syncEnabled.current = Boolean(syncName)
  const fileDialogs = useRef(0)
  const fileDialogGraceUntil = useRef(0)
  const lockPolicy = useRef<{ lockOnLeave: Settings['lockOnLeave']; autoLock: number }>({ lockOnLeave: 'immediately', autoLock: 5 })
  const idleDeadline = useRef<number | null>(null)
  const hiddenAt = useRef<number | null>(null)
  const fileDialogOpen = () => fileDialogs.current > 0 || Date.now() < fileDialogGraceUntil.current
  const locksWhenHidden = () => lockPolicy.current.lockOnLeave === 'immediately' && !fileDialogOpen()
  const lock = useCallback((broadcast = true) => {
    epoch.current++
    setLockVersion(epoch.current)
    if (session.current) void hapticImpact()
    session.current = null
    clearTimeout(syncTimer.current)
    rememberedKey.current = null
    setData(null)
    pendingLook.current = null
    setLookDraft(null)
    idleDeadline.current = null
    hiddenAt.current = null
    void clearClipboard()
    void forgetSession().catch(() => null)
    if (broadcast) channel.current?.postMessage('lock')
  }, [])
  // The remembered session expires when the inactivity auto-lock would have fired.
  // "Lock immediately when leaving" never remembers anything.
  const remember = useCallback(async () => {
    const active = session.current
    if (!active) return
    const { lockOnLeave, autoLock } = active.data.settings
    const generation = epoch.current
    const expiresAt = lockOnLeave === 'immediately' ? undefined : autoLock > 0 ? Math.min(idleDeadline.current ?? Infinity, Date.now() + autoLock * 60000) : null
    try {
      if (expiresAt === undefined) { rememberedKey.current = null; await forgetSession() }
      else if (rememberedKey.current === active.key) await touchSession(expiresAt)
      else {
        await rememberSession(active.key, expiresAt)
        if (generation === epoch.current && session.current?.key === active.key) rememberedKey.current = active.key
      }
    } catch { rememberedKey.current = null }
  }, [])
  const pauseLock = useCallback(() => {
    fileDialogs.current++
    let released = false
    return () => {
      if (released) return
      released = true
      fileDialogs.current = Math.max(0, fileDialogs.current - 1)
      fileDialogGraceUntil.current = Date.now() + 5000
    }
  }, [])
  useEffect(() => {
    lockPolicy.current = { lockOnLeave: data?.settings.lockOnLeave ?? 'immediately', autoLock: data?.settings.autoLock ?? 5 }
    if (data) void remember()
  }, [Boolean(data), data?.settings.lockOnLeave, data?.settings.autoLock, remember])
  useEffect(() => {
    if (isLoading) return
    if (!stored) { setRestoring(false); return }
    let cancelled = false
    const generation = epoch.current
    loadSession().then(async key => {
      if (!key || cancelled || session.current) return
      const decoded = await decryptVault(stored.envelope, key)
      if (cancelled || epoch.current !== generation || (document.hidden && decoded.settings.lockOnLeave === 'immediately')) return
      if (decoded.settings.lockOnLeave === 'immediately') { await forgetSession(); return }
      session.current = { key, record: stored, data: decoded }
      rememberedKey.current = key
      setData(decoded)
    }).catch(() => forgetSession().catch(() => null)).finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  // Runs once storage has loaded; later record changes come through the live session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, Boolean(stored)])
  useEffect(() => {
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('vault-events-v1')
      channel.current.onmessage = () => { lock(false); void mutate() }
    }
    const leave = () => {
      if (fileDialogOpen()) return
      const { lockOnLeave, autoLock } = lockPolicy.current
      if (lockOnLeave === 'immediately') { lock(); return }
      if (lockOnLeave === 'auto-lock' && autoLock > 0) hiddenAt.current = Date.now()
      void remember()
    }
    const back = () => {
      retryClipboardClear()
      if (idleDeadline.current !== null && Date.now() >= idleDeadline.current) { lock(); return }
      const { lockOnLeave, autoLock } = lockPolicy.current
      if (hiddenAt.current !== null && lockOnLeave === 'auto-lock' && autoLock > 0 && Date.now() - hiddenAt.current >= autoLock * 60000) lock()
      hiddenAt.current = null
    }
    const visibility = () => { if (document.hidden) leave(); else back() }
    const unload = () => { if (fileDialogOpen()) return; if (lockPolicy.current.lockOnLeave === 'immediately') lock(); else void remember() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', unload)
    const nativePause = Capacitor.isNativePlatform() ? App.addListener('pause', leave).catch(() => null) : null
    const nativeResume = Capacitor.isNativePlatform() ? App.addListener('resume', back).catch(() => null) : null
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', unload)
      channel.current?.close()
      void nativePause?.then(listener => listener?.remove())
      void nativeResume?.then(listener => listener?.remove())
    }
  }, [lock, mutate, remember])
  useEffect(() => {
    idleDeadline.current = data && data.settings.autoLock > 0 ? Date.now() + data.settings.autoLock * 60000 : null
    if (!data) return
    const span = data.settings.autoLock * 60000
    const expired = () => idleDeadline.current !== null && Date.now() >= idleDeadline.current
    const activity = () => {
      if (expired()) lock()
      else if (span > 0 && !document.hidden) idleDeadline.current = Date.now() + span
    }
    const timer = window.setInterval(() => {
      if (expired() || (document.hidden && locksWhenHidden())) lock()
    }, 1000)
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach(event => window.addEventListener(event, activity, { passive: true }))
    return () => { clearInterval(timer); idleDeadline.current = null; events.forEach(event => window.removeEventListener(event, activity)) }
  }, [Boolean(data), data?.settings.autoLock, lock])
  // The lock screen uses the last known look so a relaunch does not flash the default theme.
  const view = useMemo(() => data && lookDraft ? { ...data, settings: { ...data.settings, ...lookDraft } } : data, [data, lookDraft])
  const { data: storedLook, isLoading: lookLoading } = useSWR(data ? null : LOOK_KEY, getLook, { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false })
  const theme = view?.settings.theme ?? storedLook?.theme ?? 'dark'
  // Until both the vault record and the saved look have loaded, keep whatever the boot script painted.
  const appearance = view?.settings.appearance ?? storedLook?.appearance ?? (isLoading || lookLoading ? undefined : stored ? 'classic' : 'mono')
  useLayoutEffect(() => {
    if (!theme || !appearance) return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const root = document.documentElement
    let frame = 0
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      // Without this, every element fades on its own schedule and the change looks like a flicker.
      root.classList.add('look-switching')
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
      root.dataset.appearance = appearance
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--background').trim())
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => root.classList.remove('look-switching')) })
      void applySystemBars(dark)
    }
    apply(); cacheLook({ theme, appearance }); media.addEventListener('change', apply)
    return () => { media.removeEventListener('change', apply); cancelAnimationFrame(frame); root.classList.remove('look-switching') }
  }, [theme, appearance])
  useEffect(() => {
    if (!view) return
    const look = { theme: view.settings.theme, appearance: view.settings.appearance }
    // Keeps the lock screen on the current look the moment the vault locks.
    void mutateCache(LOOK_KEY, look, false)
    void saveLook(look)
  }, [view?.settings.theme, view?.settings.appearance])
  // Runs once on start (from the remembered look, before unlock) and again on every theme change.
  useEffect(() => {
    if (!appearance) return
    syncAppIcon(appearance as Appearance)
      .then(scheduled => { if (scheduled) toast.success('Your app icon changes the next time you leave the app. Icons already placed on the home screen need to be added again.', { duration: 8000 }) })
      .catch((error: unknown) => {
        console.error('[AppIcon] Could not switch the launcher icon', error)
        toast.warning('The app icon could not be changed on this device.')
      })
  }, [appearance])

  // Quiet operations (background appearance saves) never switch the interface to its busy state.
  async function run<T>(operation: (generation: number) => Promise<T>, quiet = false) {
    // An appearance save takes a moment; let it finish instead of rejecting the user's action.
    if (!quiet && lookSave.current) await lookSave.current
    // A background sync is short; wait for it instead of rejecting what the user just did.
    if (!quiet && syncRun.current) await syncRun.current.catch(() => undefined)
    if (inFlight.current) throw new Error('Please wait for the current operation to finish.')
    inFlight.current = true; if (!quiet) setBusy(true)
    let release!: () => void
    idle.current = new Promise<void>(resolve => { release = resolve })
    try { return await operation(epoch.current) }
    finally { inFlight.current = false; if (!quiet) setBusy(false); release() }
  }
  function assertActive(generation: number) {
    if (epoch.current !== generation || (document.hidden && locksWhenHidden())) throw new Error('Vault locked. Unlock and try again.')
  }
  async function accept(next: Session, generation: number) {
    // The record is already committed. Show it before the storage cache settles,
    // otherwise a new vault paints one screen in the fallback theme first.
    const live = generation === epoch.current && !(document.hidden && locksWhenHidden())
    if (live) { session.current = next; setData(next.data) }
    await mutate(next.record, false)
    channel.current?.postMessage('changed')
    if (live && generation === epoch.current) void remember()
  }
  const derive = (password: string, salt: string, kdf?: Kdf) => deriveKey(password, salt, Capacitor.isNativePlatform(), kdf)
  async function authenticate(password: string, record: VaultRecord) {
    await assertAttemptAllowed()
    try {
      const key = await derive(password, record.envelope.salt, record.envelope.kdf)
      const decoded = await decryptVault(record.envelope, key)
      await resetAttempts()
      void hapticSuccess()
      // Vaults and backups from before Argon2id get a fresh salt and an Argon2id key; callers re-encrypt with it.
      if (record.envelope.kdf !== CURRENT_KDF) return { key: await derive(password, newSalt()), data: decoded, upgraded: true }
      return { key, data: decoded, upgraded: false }
    } catch {
      void hapticError()
      const delay = await failAttempt()
      throw new Error(`Incorrect password or damaged vault. Try again in ${delay} seconds.`)
    }
  }
  async function create(password: string) {
    return run(async generation => {
      if (password.length < 12) throw new Error('Use at least 12 characters for your master password.')
      const salt = newSalt(), key = await derive(password, salt), initial = emptyVault()
      const envelope = await encryptVault(initial, key)
      assertActive(generation)
      const record = await commitRecord(envelope, null)
      await resetBiometric()
      await accept({ key, data: initial, record }, generation)
      void navigator.storage?.persist?.().catch(() => false)
    })
  }
  async function unlock(password: string) {
    return run(async generation => {
      const record = await getRecord()
      if (!record) { await mutate(); throw new Error('No local vault found. Create or restore one.') }
      const { key, data, upgraded } = await authenticate(password, record)
      let current = record
      if (upgraded) {
        const envelope = await encryptVault(data, key)
        assertActive(generation)
        current = await commitRecord(envelope, record.revision)
        await resetBiometric()
      }
      await open({ key, data }, current, generation)
    })
  }
  async function unlockBiometric() {
    return run(async generation => {
      const record = await getRecord()
      if (!record) { await mutate(); throw new Error('No local vault found. Create or restore one.') }
      // The system prompt can briefly background the app; that must not count as leaving it.
      const resume = pauseLock()
      let key: CryptoKey
      try { key = await unlockWithBiometric() } finally { resume() }
      let data: VaultData
      try { data = await decryptVault(record.envelope, key) }
      catch {
        await disableBiometric(); void mutateCache(BIOMETRIC_KEY)
        throw new Error('Fingerprint unlock was turned off because the vault key changed. Use your master password and turn it on again in Settings.')
      }
      void hapticSuccess()
      await open({ key, data }, record, generation)
    })
  }
  async function open(decoded: { key: CryptoKey; data: VaultData }, initial: VaultRecord, generation: number) {
    let record = initial
    assertActive(generation)
    const receipt = pendingBackup.current
    if (receipt?.revision === record.revision) {
      decoded.data.settings.lastBackupAt = receipt.at
      const envelope = await encryptVault(decoded.data, decoded.key)
      assertActive(generation)
      record = await commitRecord(envelope, record.revision)
    }
    pendingBackup.current = null
    assertActive(generation)
    session.current = { ...decoded, record }; setData(decoded.data)
    await mutate(record, false)
    void remember()
    scheduleSync(300)
  }
  async function update(transform: (current: VaultData) => VaultData, quiet = false) {
    return run(async generation => {
      const active = session.current
      if (!active) throw new Error('Unlock your vault first.')
      const nextData = purgeExpired(transform(active.data))
      const envelope = await encryptVault(nextData, active.key)
      assertActive(generation)
      const record = await commitRecord(envelope, active.record.revision)
      await accept({ ...active, data: nextData, record }, generation)
      scheduleSync()
    }, quiet)
  }
  async function performSync(generation: number, password?: string) {
    const active = session.current
    if (!active) throw new Error('Unlock your vault first.')
    const text = await readSyncFile()
    let remote: VaultData | null = null, key = active.key, rekeyed = false, upgraded = false
    if (text) {
      let envelope: Envelope
      try { envelope = envelopeSchema.parse(JSON.parse(text)) } catch { throw new Error('The sync file is not a Vault file. Choose another file.') }
      const local = active.record.envelope
      if (envelope.salt === local.salt && envelope.kdf === local.kdf) {
        try { remote = await decryptVault(envelope, active.key) } catch { throw new Error('The sync file could not be decrypted. It may be damaged.') }
      } else {
        // Another device created the file or changed the master password: prove you know it once,
        // then this device adopts that key so later syncs run without asking.
        if (!password) throw new SyncPasswordNeeded()
        const result = await authenticate(password, { ...active.record, envelope })
        remote = result.data; key = result.key; upgraded = result.upgraded; rekeyed = true
      }
    }
    const merged = purgeExpired(remote ? mergeVaults(active.data, remote) : active.data)
    assertActive(generation)
    if (rekeyed || !sameContent(merged, active.data)) {
      const record = await commitRecord(await encryptVault(merged, key), active.record.revision)
      if (rekeyed) await resetBiometric()
      await accept({ key, data: merged, record }, generation)
    }
    if (!remote || upgraded || !sameContent(merged, remote)) await writeSyncFile(JSON.stringify(await encryptVault(merged, key)))
    setSyncStatus({ at: Date.now(), error: null, needsPassword: false })
    return { rekeyed }
  }
  function startSync(password?: string, quiet = true) {
    const task = run(generation => performSync(generation, password), quiet)
    syncRun.current = task
    void task.catch(error => {
      if (!session.current) return
      setSyncStatus(current => ({ ...current, error: messageOf(error), needsPassword: error instanceof SyncPasswordNeeded }))
    }).finally(() => { if (syncRun.current === task) syncRun.current = null })
    return task
  }
  function scheduleSync(delay = 1500) {
    if (!syncEnabled.current) return
    clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => {
      if (!session.current) return
      if (inFlight.current) { scheduleSync(delay); return }
      void startSync().catch(() => undefined)
    }, delay)
  }
  async function chooseSync(create: boolean) {
    const resume = pauseLock()
    let result
    try { result = await chooseSyncFile(create) } finally { resume() }
    if (result.cancelled) return false
    await refreshSyncName(result.name ?? null, false)
    syncEnabled.current = true
    setSyncStatus({ at: null, error: null, needsPassword: false })
    return true
  }
  async function stopSync() {
    clearTimeout(syncTimer.current)
    await forgetSyncFile()
    await refreshSyncName(null, false)
    setSyncStatus({ at: null, error: null, needsPassword: false })
  }
  function setLook(patch: Partial<Look>) {
    if (!session.current) return
    pendingLook.current = { ...pendingLook.current, ...patch }
    setLookDraft(pendingLook.current)
    lookSave.current ??= (async () => {
      try {
        while (pendingLook.current) {
          while (inFlight.current) await idle.current
          const draft = pendingLook.current
          const active = session.current
          if (!draft || !active) break
          const changed = (Object.keys(draft) as (keyof Look)[]).some(key => active.data.settings[key] !== draft[key])
          if (changed) await update(current => ({ ...current, settings: { ...current.settings, ...draft } }), true)
          // A newer choice made during the save goes round the loop again.
          if (pendingLook.current === draft) { pendingLook.current = null; setLookDraft(null) }
        }
      } catch (error) {
        const locked = !session.current
        pendingLook.current = null
        setLookDraft(null)
        if (!locked) toast.error(`Your theme could not be saved. ${messageOf(error)}`)
      } finally { lookSave.current = null }
    })()
  }
  const saveEntry = (entry: Entry) => update(current => ({ ...current, entries: current.entries.some(e => e.id === entry.id) ? current.entries.map(e => e.id === entry.id ? entry : e) : [...current.entries, entry] }))
  const deleteEntry = (id: string) => update(current => moveToTrash(current, id))
  const restoreEntry = (id: string) => update(current => restoreFromTrash(current, id))
  const deleteForever = (id: string) => update(current => purgeOne(current, id))
  const emptyTrash = () => update(purgeAll)
  const setSettings = (settings: Settings) => update(current => ({ ...current, settings }))
  async function setBiometric(enabled: boolean) {
    await run(async generation => {
      const active = session.current
      if (!active) throw new Error('Unlock your vault first.')
      if (!enabled) { await disableBiometric(); return }
      const resume = pauseLock()
      try { await enableBiometric(active.key) } finally { resume() }
      assertActive(generation)
    })
    await mutateCache(BIOMETRIC_KEY)
  }
  // A new key (new master password or a restored vault) cannot be opened by the old fingerprint key.
  const resetBiometric = () => disableBiometric().then(() => mutateCache(BIOMETRIC_KEY))
  async function changePassword(currentPassword: string, nextPassword: string) {
    return run(async generation => {
      const active = session.current
      if (!active) throw new Error('Unlock your vault first.')
      if (nextPassword.length < 12) throw new Error('Use at least 12 characters.')
      await authenticate(currentPassword, active.record)
      const salt = newSalt(), key = await derive(nextPassword, salt)
      const envelope = await encryptVault(active.data, key)
      assertActive(generation)
      const record = await commitRecord(envelope, active.record.revision)
      await resetBiometric()
      await accept({ key, data: active.data, record }, generation)
    })
  }
  async function restore(text: string, password: string) {
    return run(async generation => {
      const previous = await getRecord()
      const backup = parseImportBackup(text)
      if (backup.protection === 'none' && (password.length < 12 || password.length > 1024)) throw new Error('Choose a new master password with 12–1024 characters to protect this device.')
      const decoded = backup.protection === 'password'
        ? await authenticate(password, { revision: '', envelope: backup.envelope })
        : { data: backup.data, key: await derive(password, newSalt()) }
      // Re-encrypt to get a fresh IV even when restoring an existing ciphertext.
      // Unprotected imports are never written to the device without encryption.
      const fresh = await encryptVault(decoded.data, decoded.key)
      assertActive(generation)
      const record = await commitRecord(fresh, previous?.revision ?? null)
      await resetBiometric()
      await accept({ key: decoded.key, data: decoded.data, record }, generation)
    })
  }
  async function verifyPassword(password: string) {
    return run(async () => {
      const active = session.current
      if (!active) throw new Error('Unlock your vault first.')
      await authenticate(password, active.record)
    })
  }
  async function exportBackup() {
    const result = await run(async generation => {
      const active = session.current
      const revision = active?.record.revision
      if (!active || !revision) throw new Error('Unlock your vault first.')
      const record = await getRecord()
      assertActive(generation)
      if (!record || record.revision !== revision) {
        lock(); await mutate()
        throw new Error('The vault changed in another tab. Unlock again before exporting the latest backup.')
      }
      const at = new Date().toISOString()
      const content = JSON.stringify(record.envelope)
      const resume = pauseLock()
      try {
        const result = await saveExportFile(content, 'encrypted')
        // If the vault still locked for another reason, keep only a receipt (never a key)
        // and apply it after authentication against the exact exported revision.
        if (result === 'saved' && epoch.current !== generation) pendingBackup.current = { revision, at }
        return result
      } finally { resume() }
    })
    if (result && session.current) {
      try {
        await update(current => ({ ...current, settings: { ...current.settings, lastBackupAt: new Date().toISOString() } }))
      } catch {
        toast.warning('File saved, but export history could not be updated. Check your exported file.')
      }
    }
    return result
  }
  useEffect(() => {
    if (!data) return
    const onVisible = () => { if (!document.hidden) scheduleSync(500) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [Boolean(data)])
  async function wipe() {
    return run(async () => {
      const active = session.current
      if (!active) throw new Error('Unlock your vault first.')
      await wipeRecord(active.record.revision)
      await resetBiometric()
      await mutateCache(LOOK_KEY, undefined, false)
      lock(); await mutate(undefined, false); channel.current?.postMessage('changed')
      toast.success('Local vault erased.')
    })
  }
  return { data: view, busy, lockVersion, isLoading: isLoading || (restoring && !storageError), storageError, hasVault: Boolean(stored), create, unlock, unlockBiometric, setBiometric, lock: () => lock(), pauseLock, saveEntry, deleteEntry, restoreEntry, deleteForever, emptyTrash, setSettings, setLook, changePassword, verifyPassword, restore, exportBackup, wipe, sync: { supported: syncSupported(), fileName: syncName ?? null, ...syncStatus, choose: chooseSync, now: (password?: string) => startSync(password, false), stop: stopSync } }
}
export type VaultController = ReturnType<typeof useVault>
