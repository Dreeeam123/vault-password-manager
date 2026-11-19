import { toast } from 'sonner'
import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'

async function writeClipboard(value: string) {
  if (Capacitor.isNativePlatform()) await Clipboard.write({ string: value, label: 'Vault' })
  else await navigator.clipboard.writeText(value)
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending = false
let deadline = Infinity
let generation = 0
let operations: Promise<unknown> = Promise.resolve()
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation)
  operations = next.catch(() => undefined)
  return next
}
export function clearClipboard() {
  generation++
  clearTimeout(timer)
  return ordered(async () => {
    if (!pending) return
    try { await writeClipboard(''); pending = false; deadline = Infinity }
    catch {
      // Background clipboard access is restricted; retry on focus/resume.
      deadline = 0
      toast.warning('Clipboard clearing was blocked. Please clear it manually.')
    }
  })
}
export function copySecret(value: string, seconds = 30) {
  const current = ++generation
  return ordered(async () => {
    if (current !== generation) return false
    try {
      await writeClipboard(value)
      clearTimeout(timer)
      // Disabling the timer must NOT disable cleanup when the vault locks.
      pending = true
      deadline = seconds > 0 ? Date.now() + seconds * 1000 : Infinity
      if (current !== generation) return false
      if (seconds > 0) timer = setTimeout(() => { void clearClipboard() }, seconds * 1000)
      if (Capacitor.isNativePlatform()) void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => undefined)
      toast.success(seconds > 0 ? `Copied. Clipboard clear scheduled in ${seconds} seconds.` : 'Copied. Clipboard will be cleared when you lock the vault.')
      return true
    } catch {
      toast.error('Clipboard access was blocked. Select the field and copy it manually.')
      return false
    }
  })
}
export function retryClipboardClear() { if (pending && Date.now() >= deadline) void clearClipboard() }
