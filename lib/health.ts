import type { Entry } from './types'
import { passwordStrength } from './generator'

export function getHealth(entries: Entry[], now = Date.now()) {
  const withPasswords = entries.filter(entry => entry.password)
  const counts = new Map<string, number>()
  withPasswords.forEach(entry => counts.set(entry.password, (counts.get(entry.password) ?? 0) + 1))
  const weak = withPasswords.filter(entry => passwordStrength(entry.password).score < 3)
  const reused = withPasswords.filter(entry => (counts.get(entry.password) ?? 0) > 1)
  const old = withPasswords.filter(entry => now - Date.parse(entry.passwordChangedAt) > 180 * 86400000)
  const affected = new Set([...weak, ...reused, ...old].map(entry => entry.id))
  const score = withPasswords.length ? Math.round((1 - affected.size / withPasswords.length) * 100) : 0
  return { weak, reused, old, score, affected, total: withPasswords.length }
}
