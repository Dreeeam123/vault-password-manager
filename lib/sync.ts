import type { Entry, TrashedEntry, VaultData } from './types'

/** Tombstones are kept long enough for every device to see a deletion at least once. */
const TOMBSTONE_MS = 180 * 24 * 60 * 60 * 1000

type State =
  | { kind: 'live'; at: number; entry: Entry }
  | { kind: 'trash'; at: number; item: TrashedEntry }
  | { kind: 'gone'; at: number; deletedAt: string }
const RANK = { live: 0, trash: 1, gone: 2 } as const

function states(data: VaultData) {
  const map = new Map<string, State>()
  const offer = (id: string, state: State) => {
    const current = map.get(id)
    if (!current || newer(state, current)) map.set(id, state)
  }
  for (const entry of data.entries) offer(entry.id, { kind: 'live', at: Date.parse(entry.modifiedAt), entry })
  for (const item of data.trash) offer(item.id, { kind: 'trash', at: Date.parse(item.deletedAt), item })
  for (const item of data.deleted) offer(item.id, { kind: 'gone', at: Date.parse(item.at), deletedAt: item.at })
  return map
}
// The latest change wins. On an exact tie a deletion wins, so a removed login never reappears by accident.
const newer = (a: State, b: State) => a.at > b.at || (a.at === b.at && RANK[a.kind] > RANK[b.kind])

/**
 * Merges logins, trash and deletions per entry. Device settings (lock timers, theme)
 * always stay local: they describe this device, not the vault.
 */
export function mergeVaults(local: VaultData, remote: VaultData, now = Date.now()): VaultData {
  const mine = states(local), theirs = states(remote)
  const winners = new Map(mine)
  for (const [id, state] of theirs) {
    const current = winners.get(id)
    if (!current || newer(state, current)) winners.set(id, state)
  }
  const order = [...local.entries.map(entry => entry.id), ...remote.entries.map(entry => entry.id)]
  const entries: Entry[] = []
  const placed = new Set<string>()
  for (const id of order) {
    const state = winners.get(id)
    if (state?.kind === 'live' && !placed.has(id)) { entries.push(state.entry); placed.add(id) }
  }
  const trash: TrashedEntry[] = []
  const deleted: VaultData['deleted'] = []
  for (const [id, state] of winners) {
    if (state.kind === 'trash') trash.push(state.item)
    else if (state.kind === 'gone' && now - state.at < TOMBSTONE_MS) deleted.push({ id, at: state.deletedAt })
  }
  trash.sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt))
  return { ...local, entries, trash, deleted }
}

/** True when two vaults hold the same logins, trash and deletions (settings are ignored). */
export function sameContent(a: VaultData, b: VaultData) {
  const key = (data: VaultData) => JSON.stringify([
    [...data.entries].sort((x, y) => x.id.localeCompare(y.id)),
    [...data.trash].sort((x, y) => x.id.localeCompare(y.id)),
    [...data.deleted].sort((x, y) => x.id.localeCompare(y.id)),
  ])
  return key(a) === key(b)
}
