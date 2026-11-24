import { accountScopedKey } from './accountKey'
import { normalize } from './stringMatch'

export const RECENT_SEARCH_LIMIT = 12

const STORAGE_KEY = 'beacon.mobileRecentSearches'

export interface RecentSearch {
  kind: 'artist' | 'album' | 'song'
  id: string
  name: string
  subtitle: string
  to: string
  coverArtId: string | null
}

function sameEntry(left: RecentSearch, right: RecentSearch): boolean {
  return left.kind === right.kind && normalize(left.name) === normalize(right.name)
}

function validEntry(value: unknown): RecentSearch | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<RecentSearch>
  if (entry.kind !== 'artist' && entry.kind !== 'album' && entry.kind !== 'song') return null
  if (typeof entry.id !== 'string' || !entry.id) return null
  if (typeof entry.name !== 'string' || !normalize(entry.name)) return null
  if (typeof entry.subtitle !== 'string') return null
  if (typeof entry.to !== 'string' || !entry.to.startsWith('/m/')) return null
  if (entry.coverArtId !== null && typeof entry.coverArtId !== 'string') return null
  return {
    kind: entry.kind,
    id: entry.id,
    name: entry.name,
    subtitle: entry.subtitle,
    to: entry.to,
    coverArtId: entry.coverArtId,
  }
}

function dedupe(entries: RecentSearch[]): RecentSearch[] {
  const seen: RecentSearch[] = []
  for (const entry of entries) {
    if (!seen.some((existing) => sameEntry(existing, entry))) seen.push(entry)
  }
  return seen
}

/** Newest first. Corrupt or unavailable storage simply means no recents. */
export function load(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(accountScopedKey(STORAGE_KEY))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return dedupe(
      parsed.map(validEntry).filter((entry): entry is RecentSearch => entry !== null),
    ).slice(0, RECENT_SEARCH_LIMIT)
  } catch {
    return []
  }
}

/** Re-opening a name moves it to the front rather than adding a duplicate.
 * The kind is part of the identity: an artist and an album may share a name. */
export function add(entry: RecentSearch): void {
  const valid = validEntry(entry)
  if (!valid) return
  try {
    const next = [valid, ...load().filter((existing) => !sameEntry(existing, valid))].slice(
      0,
      RECENT_SEARCH_LIMIT,
    )
    localStorage.setItem(accountScopedKey(STORAGE_KEY), JSON.stringify(next))
  } catch {
    // Private mode or a full quota must not stop somebody opening music.
  }
}

export function remove(kind: RecentSearch['kind'], name: string): void {
  try {
    const target = normalize(name)
    const next = load().filter((entry) => entry.kind !== kind || normalize(entry.name) !== target)
    localStorage.setItem(accountScopedKey(STORAGE_KEY), JSON.stringify(next))
  } catch {
    // The in-memory list still updates for this visit.
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(accountScopedKey(STORAGE_KEY))
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
