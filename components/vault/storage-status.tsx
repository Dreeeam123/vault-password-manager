'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Capacitor } from '@capacitor/core'

async function readStorage() {
  return { persistent: await navigator.storage?.persisted?.() ?? false, supported: Boolean(navigator.storage?.persist), origin: location.origin }
}
export function StorageStatus() {
  const native = Capacitor.isNativePlatform()
  const { data, mutate } = useSWR(native ? null : 'vault-storage-protection', readStorage, { revalidateOnFocus: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function protect() {
    setBusy(true)
    try {
      const granted = await navigator.storage.persist()
      await mutate()
      setMessage(granted ? 'Persistent storage granted. Keep exporting backups: clearing site data still deletes the vault.' : 'Your browser did not grant persistence. Keep encrypted backups outside this browser.')
    } catch { setMessage('Storage protection is unavailable in this browser. Export a backup instead.') }
    finally { setBusy(false) }
  }
  return <div className="border-b border-border p-5"><h3 className="text-sm font-medium">{native ? 'Private app storage' : 'Local browser storage'}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{native ? 'Entries and settings are encrypted inside this app’s private Android storage. Your master password is never saved. Remembered session keys are encrypted with Android Keystore and cleared when you lock.' : 'Entries and settings are encrypted in this browser. Your master password and key are never saved.'}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{native ? 'Uninstalling Vault or clearing its app data deletes the local vault. Export a backup before changing devices or app versions.' : 'Another browser or address has separate storage. Clearing site data or using private browsing can remove your vault.'}</p><details className="mt-4 text-sm"><summary className="cursor-pointer text-muted-foreground">Technical details</summary><div className="mt-3 flex flex-col gap-3 leading-relaxed text-muted-foreground"><p>{native ? 'This is an offline Capacitor Android app with a bundled WebView interface and native file picker, clipboard and screenshot protection. The internal https://localhost address loads packaged app files only; it is not a remote website or a server you need to run. The interface is not written in Kotlin.' : 'Encrypted data is stored in IndexedDB, scoped to this site’s address.'}</p><p>Database: <code>vault-private-v1</code> · AES-256-GCM</p>{!native && data && <p className="break-all">Site address: {data.origin}</p>}</div></details>{!native && <div className="mt-4 flex flex-wrap items-center gap-3"><span className="text-sm">{!data ? 'Checking storage protection…' : data.persistent ? 'Persistent storage enabled' : 'Browser-managed storage'}</span>{data?.supported && !data.persistent && <Button variant="outline" disabled={busy} onClick={() => void protect()}>{busy ? 'Requesting…' : 'Protect local storage'}</Button>}</div>}{message && <p role="status" className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>}</div>
}
