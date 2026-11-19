import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()

declare global {
  interface Window {
    /** Injected by the Electron preload script in the Windows app. */
    vaultDesktop?: Readonly<{ platform: string; electron: string }>
  }
}

/** True inside the packaged Windows (Electron) app; false on Android and in the browser. */
export const isDesktop = () => typeof window !== 'undefined' && window.vaultDesktop !== undefined

async function haptics() {
  if (!isNative()) return null
  return import('@capacitor/haptics').catch(() => null)
}

/** Light tick for navigation and toggles. */
export async function hapticTap() {
  const module = await haptics()
  await module?.Haptics.selectionChanged().catch(() => undefined)
}

/** Firm thump for lock/unlock and other decisive actions. */
export async function hapticImpact() {
  const module = await haptics()
  await module?.Haptics.impact({ style: module.ImpactStyle.Medium }).catch(() => undefined)
}

export async function hapticSuccess() {
  const module = await haptics()
  await module?.Haptics.notification({ type: module.NotificationType.Success }).catch(() => undefined)
}

export async function hapticError() {
  const module = await haptics()
  await module?.Haptics.notification({ type: module.NotificationType.Error }).catch(() => undefined)
}

/** Status and gesture bar icons follow the in-app light/dark mode. */
export async function applySystemBars(dark: boolean) {
  if (!isNative()) return
  await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined)
}

/**
 * Android hardware/gesture back. The handler returns true when it consumed the
 * press; otherwise the app is sent to the background like a native app would be
 * (instead of being destroyed and re-launched cold).
 */
export async function onBackButton(handler: () => boolean) {
  if (!isNative()) return () => undefined
  const { App } = await import('@capacitor/app')
  const listener = await App.addListener('backButton', () => { if (!handler()) void App.minimizeApp() })
  return () => { void listener.remove() }
}

/** Closes the topmost open dialog or sheet, if any. */
export function dismissTopLayer() {
  const layer = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]')
  if (!layer) return false
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  return true
}
