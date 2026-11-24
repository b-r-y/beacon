import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { RECENT_SEARCH_LIMIT, add, clear, load, remove, type RecentSearch } from '../recentSearches'

const STORAGE_KEY = 'beacon.mobileRecentSearches'

function recent(kind: RecentSearch['kind'], name: string, overrides: Partial<RecentSearch> = {}) {
  return {
    kind,
    id: `${kind}-${name}`,
    name,
    subtitle: 'Someone',
    to: `/m/${kind === 'artist' ? 'artists' : 'albums'}/${kind}-${name}`,
    coverArtId: null,
    ...overrides,
  } satisfies RecentSearch
}

function signIn(username: string) {
  const auth = useAuthStore()
  auth.serverType = 'subsonic'
  auth.serverUrl = 'https://music.example'
  auth.username = username
  auth.authenticated = true
}

describe('recentSearches', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('starts empty and reads back what was added', () => {
    expect(load()).toEqual([])
    const entry = recent('album', 'Blue Album')
    add(entry)
    expect(load()).toEqual([entry])
  })

  it('puts the newest first and dedupes normalized names within a kind', () => {
    const first = recent('artist', 'Bohème', { id: 'old-id' })
    add(first)
    add(recent('album', 'Bohème'))
    add(recent('artist', 'BOHEME', { id: 'new-id', subtitle: 'Two albums' }))

    expect(load()).toEqual([
      recent('artist', 'BOHEME', { id: 'new-id', subtitle: 'Two albums' }),
      recent('album', 'Bohème'),
    ])
  })

  it('treats punctuation variants of one name as the same recent entry', () => {
    add(recent('song', "Don't Stop"))
    add(recent('song', 'Dont Stop', { id: 'new-song' }))
    expect(load()).toEqual([recent('song', 'Dont Stop', { id: 'new-song' })])
  })

  it('keeps only the twelve newest entries', () => {
    for (let index = 0; index < RECENT_SEARCH_LIMIT + 3; index++) {
      add(recent('album', `Album ${index}`))
    }

    const stored = load()
    expect(stored).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(stored[0]?.name).toBe(`Album ${RECENT_SEARCH_LIMIT + 2}`)
    expect(stored.some((entry) => entry.name === 'Album 0')).toBe(false)
  })

  it('removes one normalized name without removing another kind with the same name', () => {
    add(recent('artist', 'Blue'))
    add(recent('album', 'BLUE'))

    remove('artist', ' blue ')
    expect(load()).toEqual([recent('album', 'BLUE')])

    clear()
    expect(load()).toEqual([])
  })

  it('keeps each account’s recents separate on the same device', () => {
    signIn('alice')
    add(recent('album', 'Alice’s Album'))

    signIn('bob')
    expect(load()).toEqual([])
    add(recent('album', 'Bob’s Album'))

    signIn('alice')
    expect(load()).toEqual([recent('album', 'Alice’s Album')])
  })

  it('ignores corrupt JSON, wrong shapes and invalid entries', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(load()).toEqual([])

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Not a list' }))
    expect(load()).toEqual([])

    const valid = recent('album', 'Valid')
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        valid,
        null,
        'not an entry',
        { ...valid, kind: 'playlist' },
        { ...valid, id: 4 },
        { ...valid, name: '---' },
        { ...valid, to: 'https://example.com' },
      ]),
    )
    expect(load()).toEqual([valid])
  })

  it('deduplicates and caps entries read from older or hand-edited storage', () => {
    const entries = Array.from({ length: RECENT_SEARCH_LIMIT + 2 }, (_, index) =>
      recent('album', `Album ${index}`),
    )
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([entries[0], { ...entries[0], id: 'duplicate' }, ...entries.slice(1)]),
    )

    const stored = load()
    expect(stored).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(stored[0]?.id).toBe(entries[0]?.id)
  })

  it('does not throw when storage cannot be read, written or removed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    expect(load()).toEqual([])
    expect(() => add(recent('album', 'Blue'))).not.toThrow()
    expect(() => remove('album', 'Blue')).not.toThrow()
    expect(() => clear()).not.toThrow()

    vi.restoreAllMocks()
    add(recent('album', 'Blue'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    expect(() => add(recent('album', 'Another'))).not.toThrow()
    expect(() => remove('album', 'Blue')).not.toThrow()
    expect(() => clear()).not.toThrow()
    expect(load()).toEqual([recent('album', 'Blue')])
  })
})
