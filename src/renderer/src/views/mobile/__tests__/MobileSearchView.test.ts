import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import { makeSong } from '@/stores/__tests__/fixtures'
import { add, load, type RecentSearch } from '@/services/recentSearches'
import type { Album, Artist, Playlist, RadioStation } from '@/types/library'
import MobileSearchView from '../MobileSearchView.vue'

const vuetify = createVuetify({ components, directives })
const wrappers: VueWrapper[] = []

function artist(id: string, name: string): Artist {
  return {
    id,
    name,
    albumCount: 2,
    coverArtId: `cover-${id}`,
    imageUrl: null,
    starred: false,
    rating: 0,
    albums: [],
  }
}

function album(id: string, name: string): Album {
  return {
    id,
    name,
    artist: 'Someone',
    artistId: 'ar-1',
    coverArtId: `cover-${id}`,
    songCount: 2,
    duration: 180,
    year: 2024,
    genre: null,
    starred: false,
    rating: 0,
    songs: [],
  }
}

function playlist(id: string, name: string): Playlist {
  return {
    id,
    name,
    songCount: 2,
    duration: 180,
    coverArtId: null,
    public: false,
    owner: 'listener',
    changed: null,
    readonly: false,
    smart: false,
    songs: [],
  }
}

function station(id: string, name: string): RadioStation {
  return {
    id,
    name,
    streamUrl: `https://stream.example/${id}`,
    homePageUrl: 'https://station.example',
  }
}

function recent(kind: RecentSearch['kind'], name: string): RecentSearch {
  return {
    kind,
    id: `${kind}-1`,
    name,
    subtitle: 'Someone',
    to: kind === 'artist' ? '/m/artists/ar-1' : '/m/albums/al-1',
    coverArtId: null,
  }
}

function stubStore() {
  const library = useLibraryStore()
  vi.spyOn(library, 'search').mockResolvedValue()
  vi.spyOn(library, 'fetchPlaylists').mockResolvedValue()
  vi.spyOn(library, 'fetchRadioStations').mockResolvedValue()
  return library
}

async function mountSearch({ q = '', radio = true } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/m/search', name: 'm-search', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push({ path: '/m/search', query: q ? { q } : {} })
  await router.isReady()

  if (!radio) {
    const auth = useAuthStore()
    const capabilities = auth.capabilities
    vi.spyOn(auth, 'capabilities', 'get').mockReturnValue({
      ...capabilities,
      internetRadio: false,
    })
  }

  const wrapper = mount(MobileSearchView, {
    global: {
      plugins: [vuetify, i18n, router],
      stubs: { CoverArt: true, MobileSongActionSheet: true, TileContextMenu: true },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

async function chooseFilter(wrapper: VueWrapper, label: string) {
  const button = wrapper
    .findAll('.mobile-search__filter')
    .find((candidate) => candidate.text() === label)
  expect(button, `filter ${label}`).toBeDefined()
  await button!.trigger('click')
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('MobileSearchView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('opens with the mobile header, a sticky search field and the first-use empty state', async () => {
    const library = stubStore()
    const { wrapper } = await mountSearch()

    expect(wrapper.get('.mobile-header__title').text()).toBe(i18n.global.t('mobile.tabSearch'))
    expect(wrapper.findComponent({ name: 'StickyFilter' }).exists()).toBe(true)
    expect(wrapper.get('input[type="text"]').attributes('placeholder')).toBe(
      i18n.global.t('search.whatToListenTo'),
    )
    expect(wrapper.text()).toContain(i18n.global.t('search.label'))
    const empty = wrapper.findComponent({ name: 'EmptyState' })
    expect(empty.props('title')).toBe(i18n.global.t('search.searchYourMusic'))
    expect(empty.props('text')).toBe(i18n.global.t('search.searchYourMusicHint'))
    expect(library.fetchPlaylists).toHaveBeenCalled()
    expect(library.fetchRadioStations).toHaveBeenCalled()
    expect(library.search).not.toHaveBeenCalled()
  })

  it('shows stored recents with their destinations and supports individual and bulk removal', async () => {
    stubStore()
    add(recent('album', 'Blue Album'))
    add(recent('artist', 'Bohème'))
    const { wrapper } = await mountSearch()

    expect(wrapper.text()).toContain(i18n.global.t('search.recentSearches'))
    const links = wrapper.findAll('.mobile-search__recent-link')
    expect(links.map((link) => link.text())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Bohème'),
        expect.stringContaining('Blue Album'),
      ]),
    )
    expect(links.find((link) => link.text().includes('Bohème'))?.attributes('href')).toBe(
      '/m/artists/ar-1',
    )
    expect(links.find((link) => link.text().includes('Blue Album'))?.attributes('href')).toBe(
      '/m/albums/al-1',
    )

    await wrapper
      .get(`[aria-label="${i18n.global.t('search.removeRecent')}: Bohème"]`)
      .trigger('click')
    expect(load().map((entry) => entry.name)).toEqual(['Blue Album'])
    expect(wrapper.text()).not.toContain('Bohème')

    const clearButton = wrapper
      .findAll('button')
      .find((button) => button.text() === i18n.global.t('search.clearRecent'))
    await clearButton!.trigger('click')
    expect(load()).toEqual([])
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('shows the filter chips in search order', async () => {
    vi.useFakeTimers()
    stubStore()
    const { wrapper } = await mountSearch()
    await wrapper.get('input[type="text"]').setValue('blue')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    expect(wrapper.findAll('.mobile-search__filter').map((chip) => chip.text())).toEqual([
      i18n.global.t('playlists.segmentAll'),
      i18n.global.t('nav.songs'),
      i18n.global.t('nav.artists'),
      i18n.global.t('nav.albums'),
      i18n.global.t('nav.playlists'),
      i18n.global.t('nav.radio'),
    ])
  })

  it('omits radio entirely when the account cannot use it', async () => {
    const library = stubStore()
    library.radioStations = [station('r1', 'Blue FM')]
    const { wrapper } = await mountSearch({ q: 'blue', radio: false })

    expect(wrapper.findAll('.mobile-search__filter').map((chip) => chip.text())).not.toContain(
      i18n.global.t('nav.radio'),
    )
    expect(wrapper.text()).not.toContain('Blue FM')
    expect(library.fetchRadioStations).not.toHaveBeenCalled()
  })

  it('uses shelves for All and a grid for a selected artist or album filter', async () => {
    vi.useFakeTimers()
    const library = stubStore()
    library.searchResults = {
      artists: [artist('ar1', 'Blue Band')],
      albums: [album('al1', 'Blue Album')],
      songs: [makeSong('s1', { title: 'Blue Song' })],
    }
    const { wrapper } = await mountSearch({ q: 'blue' })

    expect(wrapper.findAll('.mobile-search__shelf')).toHaveLength(2)
    expect(wrapper.findAll('.mobile-search__grid')).toHaveLength(0)
    expect(wrapper.findAll('.mobile-search__section-title').map((title) => title.text())).toEqual([
      i18n.global.t('nav.artists'),
      i18n.global.t('nav.albums'),
      i18n.global.t('nav.songs'),
    ])

    await chooseFilter(wrapper, i18n.global.t('nav.artists'))
    expect(wrapper.findAll('.mobile-search__shelf')).toHaveLength(0)
    expect(wrapper.findAll('.mobile-search__grid')).toHaveLength(1)
    expect(wrapper.findAllComponents({ name: 'MobileSongRow' })).toHaveLength(0)
    const tile = wrapper.getComponent({ name: 'MobileCoverTile' })
    expect(tile.props('round')).toBe(true)
    expect(tile.props('to')).toBe('/m/artists/ar1')

    await wrapper.get('input[type="text"]').setValue('')
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    await wrapper.get('input[type="text"]').setValue('blue')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    const selected = wrapper
      .findAll('.mobile-search__filter')
      .find((chip) => chip.text() === i18n.global.t('nav.artists'))
    expect(selected?.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.mobile-search__grid')).toHaveLength(1)
  })

  it('trims, waits 350ms and ignores terms shorter than two characters', async () => {
    vi.useFakeTimers()
    const library = stubStore()
    const { wrapper, router } = await mountSearch()
    const input = wrapper.get('input[type="text"]')

    await input.setValue('b')
    await vi.advanceTimersByTimeAsync(1000)
    expect(library.search).not.toHaveBeenCalled()

    await input.setValue('  bl  ')
    await vi.advanceTimersByTimeAsync(349)
    expect(library.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(library.search).toHaveBeenCalledWith('bl')
    expect(router.currentRoute.value.query.q).toBe('bl')

    await input.setValue('')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBeUndefined()
  })

  it('keeps the newest answer when an older search resolves last', async () => {
    vi.useFakeTimers()
    const library = stubStore()
    const oldRequest = deferred<void>()
    const newRequest = deferred<void>()
    const oldSong = makeSong('old', { title: 'Old match' })
    const newSong = makeSong('new', { title: 'New match' })
    vi.mocked(library.search).mockImplementation((term) => {
      const request = term === 'old' ? oldRequest : newRequest
      return request.promise.then(() => {
        library.searchResults = {
          artists: [],
          albums: [],
          songs: [term === 'old' ? oldSong : newSong],
        }
      })
    })
    const { wrapper } = await mountSearch()
    const input = wrapper.get('input[type="text"]')

    await input.setValue('old')
    await vi.advanceTimersByTimeAsync(350)
    await input.setValue('new')
    await vi.advanceTimersByTimeAsync(350)
    expect(library.search).toHaveBeenCalledTimes(2)

    newRequest.resolve()
    await flushPromises()
    expect(wrapper.getComponent({ name: 'MobileSongRow' }).props('song').id).toBe('new')

    oldRequest.resolve()
    await flushPromises()
    expect(wrapper.getComponent({ name: 'MobileSongRow' }).props('song').id).toBe('new')
    expect(library.searchResults.songs.map((song) => song.id)).toEqual(['new'])
  })

  it('takes an initial route query immediately and follows later external query changes', async () => {
    const library = stubStore()
    const { wrapper, router } = await mountSearch({ q: '  Blue  ' })

    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('Blue')
    expect(library.search).toHaveBeenCalledWith('Blue')

    await router.replace({ query: { q: 'Red' } })
    await flushPromises()
    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('Red')
    expect(library.search).toHaveBeenLastCalledWith('Red')

    await router.replace({ query: {} })
    await flushPromises()
    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('renders sections in order and filters playlists and radio by exact name terms', async () => {
    const library = stubStore()
    library.searchResults = {
      artists: [artist('ar1', 'Blue Band')],
      albums: [album('al1', 'Blue Album')],
      songs: [makeSong('s1', { title: 'Blue Song' })],
    }
    library.playlists = [playlist('p1', 'Blue Night'), playlist('p2', 'Blur Night')]
    library.radioStations = [station('r1', 'Blue FM'), station('r2', 'Blur FM')]
    const { wrapper } = await mountSearch({ q: 'blue' })

    expect(wrapper.findAll('.mobile-search__section-title').map((title) => title.text())).toEqual([
      i18n.global.t('nav.artists'),
      i18n.global.t('nav.albums'),
      i18n.global.t('nav.songs'),
      i18n.global.t('nav.playlists'),
      i18n.global.t('nav.radio'),
    ])

    await chooseFilter(wrapper, i18n.global.t('nav.playlists'))
    const playlists = wrapper.findAllComponents({ name: 'MobilePlaylistRow' })
    expect(playlists).toHaveLength(1)
    expect(playlists[0]?.props('playlist').name).toBe('Blue Night')

    await chooseFilter(wrapper, i18n.global.t('nav.radio'))
    const stations = wrapper.findAllComponents({ name: 'MobileRadioRow' })
    expect(stations).toHaveLength(1)
    expect(stations[0]?.props('station').name).toBe('Blue FM')
  })

  it('shows a centered searching state, then the no-results state', async () => {
    const library = stubStore()
    const request = deferred<void>()
    vi.mocked(library.search).mockReturnValue(request.promise)
    const { wrapper } = await mountSearch({ q: 'missing' })

    const loading = wrapper.get('.mobile-search__loading')
    expect(loading.text()).toContain(i18n.global.t('search.searching'))
    expect(loading.findComponent({ name: 'VProgressCircular' }).exists()).toBe(true)

    request.resolve()
    await flushPromises()
    expect(wrapper.find('.mobile-search__loading').exists()).toBe(false)
    const empty = wrapper.findComponent({ name: 'EmptyState' })
    expect(empty.props('title')).toBe(i18n.global.t('search.noResults', { query: 'missing' }))
    expect(empty.props('text')).toBe(i18n.global.t('search.noResultsHint'))
  })

  it('shows a retryable search error without hiding matching playlists', async () => {
    const library = stubStore()
    library.playlists = [playlist('p1', 'Blue Night')]
    vi.mocked(library.search).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue()
    const { wrapper } = await mountSearch({ q: 'blue' })

    expect(wrapper.get('.v-alert').text()).toContain(i18n.global.t('search.failed'))
    expect(wrapper.findAllComponents({ name: 'MobilePlaylistRow' })).toHaveLength(1)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

    const retry = wrapper
      .findAll('button')
      .find((button) => button.text() === i18n.global.t('common.retry'))
    await retry!.trigger('click')
    await flushPromises()
    expect(library.search).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.v-alert').exists()).toBe(false)
  })

  it('remembers opened artist and album results with their mobile destinations', async () => {
    const library = stubStore()
    library.searchResults = {
      artists: [artist('ar1', 'Blue Band')],
      albums: [album('al1', 'Blue Album')],
      songs: [],
    }
    const { wrapper } = await mountSearch({ q: 'blue' })
    const tiles = wrapper.findAll('.mobile-search__shelf-item')

    expect(tiles[0]?.get('a').attributes('href')).toBe('/m/artists/ar1')
    expect(tiles[1]?.get('a').attributes('href')).toBe('/m/albums/al1')
    await tiles[0]!.trigger('click')
    await tiles[1]!.trigger('click')

    expect(load()).toEqual([
      expect.objectContaining({ kind: 'album', name: 'Blue Album', to: '/m/albums/al1' }),
      expect.objectContaining({ kind: 'artist', name: 'Blue Band', to: '/m/artists/ar1' }),
    ])
  })

  it('plays only the tapped song, opens its actions and recents only songs with an album', async () => {
    const library = stubStore()
    const withAlbum = makeSong('s1', { title: 'One', albumId: 'al1' })
    const withoutAlbum = makeSong('s2', { title: 'Two', albumId: '' })
    const tapped = makeSong('s3', { title: 'Three', albumId: 'al3' })
    library.searchResults = { artists: [], albums: [], songs: [withAlbum, withoutAlbum, tapped] }
    const playSongList = vi.spyOn(usePlaybackStore(), 'playSongList').mockResolvedValue()
    const { wrapper } = await mountSearch({ q: 'blue' })
    const rows = wrapper.findAllComponents({ name: 'MobileSongRow' })

    await rows[2]!.trigger('click')
    await flushPromises()
    expect(playSongList).toHaveBeenLastCalledWith([tapped], 0)
    expect(load()).toEqual([
      expect.objectContaining({ kind: 'song', name: 'Three', to: '/m/albums/al3' }),
    ])

    await rows[1]!.trigger('click')
    await flushPromises()
    expect(playSongList).toHaveBeenLastCalledWith([withoutAlbum], 0)
    expect(load()).toHaveLength(1)

    await rows[0]!.get('button').trigger('click')
    const sheet = wrapper.findComponent({ name: 'MobileSongActionSheet' })
    expect(sheet.props('song').id).toBe(withAlbum.id)
    expect(sheet.props('modelValue')).toBe(true)
  })

  it('plays a selected playlist as a sequence and a selected radio station directly', async () => {
    const library = stubStore()
    const selected = playlist('p1', 'Blue Night')
    const songs = [makeSong('s1'), makeSong('s2')]
    library.playlists = [selected]
    library.radioStations = [station('r1', 'Blue FM')]
    vi.spyOn(library, 'fetchPlaylist').mockResolvedValue({ ...selected, songs })
    const playback = usePlaybackStore()
    const playSongList = vi.spyOn(playback, 'playSongList').mockResolvedValue()
    const playRadioStation = vi.spyOn(playback, 'playRadioStation').mockResolvedValue()
    const { wrapper } = await mountSearch({ q: 'blue' })

    await chooseFilter(wrapper, i18n.global.t('nav.playlists'))
    await wrapper.getComponent({ name: 'MobilePlaylistRow' }).get('button').trigger('click')
    await flushPromises()
    expect(library.fetchPlaylist).toHaveBeenCalledWith('p1')
    expect(playSongList).toHaveBeenCalledWith(songs, 0, false)

    await chooseFilter(wrapper, i18n.global.t('nav.radio'))
    await wrapper.getComponent({ name: 'MobileRadioRow' }).trigger('click')
    expect(playRadioStation).toHaveBeenCalledWith(library.radioStations[0])
  })
})
