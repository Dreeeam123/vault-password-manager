import { Capacitor, registerPlugin } from '@capacitor/core'
import palette from './app-icons.json'
import type { Appearance } from './types'

type AppIconPlugin = {
  get(): Promise<{ alias: string }>
  set(options: { alias: string }): Promise<{ alias: string; deferred?: boolean }>
}

const AppIcon = registerPlugin<AppIconPlugin>('AppIcon')
export const APP_ICONS = palette as Record<Appearance, { background: string; mark: string; alias: string }>
export const launcherAliasFor = (appearance: Appearance) => APP_ICONS[appearance]?.alias ?? APP_ICONS.classic.alias
export const appIconPreview = (appearance: Appearance) => `/app-icons/${appearance in APP_ICONS ? appearance : 'classic'}.png`

/**
 * Keeps the Android home-screen icon in sync with the theme. No-op on the web.
 * Android applies the switch only after the app goes to the background (switching the live
 * launcher entry would close the app), so `true` means "scheduled", not "already visible".
 */
export async function syncAppIcon(appearance: Appearance): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (!Capacitor.isPluginAvailable('AppIcon')) {
    console.error('[AppIcon] Native plugin "AppIcon" is not registered; the launcher icon cannot follow the theme.')
    return false
  }
  const alias = launcherAliasFor(appearance)
  const { alias: current } = await AppIcon.get()
  if (current === alias) return false
  const { deferred } = await AppIcon.set({ alias })
  return deferred === true
}
