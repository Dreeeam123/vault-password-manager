import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Entry } from './types'

export type AutofillRequest = { domain: string | null; packageName: string | null; appName: string | null }
type AutofillPlugin = {
  request(): Promise<{ active: boolean; domain?: string; packageName?: string; appName?: string }>
  fill(options: { username: string; password: string }): Promise<void>
  cancel(): Promise<void>
  status(): Promise<{ supported: boolean; enabled: boolean }>
  openSettings(): Promise<void>
}

const Autofill = registerPlugin<AutofillPlugin>('Autofill')
export const AUTOFILL_REQUEST_KEY = 'autofill-request'
export const AUTOFILL_STATUS_KEY = 'autofill-status'
const available = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Autofill')

/** Set when Android opened VAULT to fill a login into another app or website. */
export async function getAutofillRequest(): Promise<AutofillRequest | null> {
  if (!available()) return null
  const result = await Autofill.request().catch(() => ({ active: false }) as Awaited<ReturnType<AutofillPlugin['request']>>)
  if (!result.active) return null
  return { domain: result.domain || null, packageName: result.packageName || null, appName: result.appName || null }
}

export const fillLogin = (entry: Entry) => Autofill.fill({ username: entry.username, password: entry.password })
export const cancelAutofill = () => Autofill.cancel().catch(() => undefined)

export async function autofillStatus() {
  if (!available()) return { supported: false, enabled: false }
  return Autofill.status().catch(() => ({ supported: false, enabled: false }))
}
export const openAutofillSettings = () => Autofill.openSettings()

const IGNORED_PARTS = new Set(['com', 'org', 'net', 'app', 'android', 'mobile', 'www', 'm', 'co', 'io', 'de', 'uk', 'client', 'release', 'prod', 'lite'])

/**
 * Distinctive words of an app's package name: "com.instagram.android" -> ["instagram"].
 * Websites never use word matching, so a look-alike such as "evil-example.com"
 * is not suggested for "example.com".
 */
export function matchTokens(request: AutofillRequest): string[] {
  if (request.domain) return []
  const source = (request.packageName ?? '').toLowerCase()
  return [...new Set(source.split(/[^a-z0-9]+/).filter(part => part.length > 2 && !IGNORED_PARTS.has(part)))]
}

function hostOf(url: string) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/**
 * Websites match on their saved address (also subdomains); apps match on the
 * distinctive words of their package name. The user always picks the login,
 * so a loose match never fills anything on its own.
 */
export function suggestLogins(entries: Entry[], request: AutofillRequest): Entry[] {
  const domain = request.domain?.toLowerCase().replace(/^www\./, '') ?? ''
  const tokens = matchTokens(request)
  const score = (entry: Entry) => {
    const host = hostOf(entry.url)
    if (domain && host && (domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`))) return 3
    const haystack = `${host} ${entry.title} ${entry.icon ?? ''}`.toLowerCase()
    return tokens.some(token => haystack.includes(token)) ? 1 : 0
  }
  return entries.map(entry => ({ entry, rank: score(entry) })).filter(item => item.rank > 0).sort((a, b) => b.rank - a.rank || a.entry.title.localeCompare(b.entry.title)).map(item => item.entry)
}
