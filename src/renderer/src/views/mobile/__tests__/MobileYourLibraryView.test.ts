import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { applyLocale, i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { makeSong } from '@/stores/__tests__/fixtures'
import MobileYourLibraryView from '../MobileYourLibraryView.vue'
import type { Album, Artist, Playlist } from '@/types/library'

const vuetify = createVuetify({ components, directives })
const wrappers: VueWrapper[] = []
const openPlaylistDialog = vi.fn()

const CreatePlaylistDialogStub = {
  name: 'CreatePlaylistDialog',
  template: '<div />',
  methods: { open: openPlaylistDialog },
}

type Segment = 'all' | 'playlists' | 'albums' | 'artists'
type Sort = 'recent' | 'newest' | 'alphabetical'
type Layout = 'grid' | 'list'

interface ViewState {
  segment: Segment
  sort: Sort
  layout: Layout
  filterQuery: string
  searchOpen: boolean
  visibleCount: number
  hasMore: boolean
  sortedEntries: { key: string; kind: string; item: { name: string } }[]
}

function makePlaylist(id: string, overrides: Partial<Playlist> = {}): Playlist {
  return {
    id,
    name: `Playlist ${id}`,
    songCount: 4,
    duration: 240,
    coverArtId: null,
    public: false,
    owner: 'me',
    changed: null,
    readonly: false,
    smart: false,
    songs: [],
    ...overrides,
  }
}

function makeAlbum(id: string, overrides: Partial<Album> = {}): Album {
  return {
    id,
    name: `Album ${id}`,
    artist: `Artist ${id}`,
    artistId: `ar-${id}`,
    coverArtId: null,
    songCount: 2,
    duration: 180,
    year: 2020,
    genre: null,
    starred: true,
    rating: 0,
    songs: [],
    ...overrides,
  }
}

function makeArtist(id: string, overrides: Partial<Artist> = {}): Artist {
  return {
    id,
    name: `Artist ${id}`,
    albumCount: 2,
    coverArtId: null,
    imageUrl: null,
    starred: true,
    rating: 0,
    albums: [],
    ...overrides,
  }
}

interface MountOptions {
  query?: Record<string, string>
  router?: Router
  recent?: Album[]
  host?: boolean
  configure?: (library: ReturnType<typeof useLibraryStore>) => void
}

async function mountView(options: MountOptions = {}) {
  const library = useLibraryStore()
  vi.spyOn(library, 'fetchPlaylists').mockResolvedValue()
  vi.spyOn(library, 'fetchStarred').mockResolvedValue()
  vi.spyOn(library, 'fetchAlbums').mockResolvedValue()
  vi.spyOn(library, 'fetchArtists').mockResolvedValue()
  vi.spyOn(library, 'fetchRecentlyPlayedAlbums').mockResolvedValue(options.recent ?? [])
  options.configure?.(library)

  const router =
    options.router ??
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
  if (!options.router) {
    await router.push({ path: '/m/your-library', query: options.query ?? {} })
    await router.isReady()
  }
  const replace = vi.spyOn(router, 'replace')

  const global = {
    plugins: [vuetify, i18n, router],
    stubs: {
      CoverArt: true,
      CreatePlaylistDialog: CreatePlaylistDialogStub,
    },
  }
  const host = options.host
    ? {
        components: { MobileYourLibraryView },
        data: () => ({ show: true }),
        template: '<mobile-your-library-view v-if="show" />',
      }
    : null
  const root = host
    ? mount(host, { attachTo: document.body, global })
    : mount(MobileYourLibraryView, { attachTo: document.body, global })
  wrappers.push(root)
  await flushPromises()
  const wrapper = host ? root.findComponent(MobileYourLibraryView) : root
  return { wrapper, host: root, router, library, replace }
}

function state(wrapper: VueWrapper): ViewState {
  return wrapper.vm as unknown as ViewState
}

function entryKeys(wrapper: VueWrapper): string[] {
  return state(wrapper).sortedEntries.map((entry) => entry.key)
}

function collectionTiles(wrapper: VueWrapper) {
  const favorites = i18n.global.t('nav.favorites')
  return wrapper
    .findAllComponents({ name: 'MobileCoverTile' })
    .filter((tile) => tile.props('title') !== favorites)
}

async function clickSegment(
  wrapper: VueWrapper,
  label: string,
  replace?: { mock: { results: { value: unknown }[] } },
) {
  const button = wrapper
    .findAll('.your-library__segment')
    .find((candidate) => candidate.text() === label)
  expect(button, `segment ${label}`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
  await replace?.mock.results.at(-1)?.value
  await flushPromises()
}

async function chooseSort(wrapper: VueWrapper, sort: Sort) {
  wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', sort)
  await flushPromises()
}

async function chooseLayout(wrapper: VueWrapper, label: string) {
  await wrapper.get(`.your-library__layout [aria-label="${label}"]`).trigger('click')
  await flushPromises()
}

async function goBack(router: Router) {
  await new Promise<void>((resolve) => {
    const remove = router.afterEach(() => {
      remove()
      resolve()
    })
    router.back()
  })
  await flushPromises()
}

function unmount(wrapper: VueWrapper) {
  const index = wrappers.indexOf(wrapper)
  if (index >= 0) wrappers.splice(index, 1)
  wrapper.unmount()
}

describe('MobileYourLibraryView', () => {
  beforeEach(() => {
    localStorage.clear()
    openPlaylistDialog.mockReset()
    setActivePinia(createPinia())
    applyLocale('en')
  })

  afterEach(() => {
    while (wrappers.length) wrappers.pop()?.unmount()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('mixes playlists with starred albums and artists, but never lists favorite songs', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('p1', { name: 'Alpha Playlist' })]
    library.starred = {
      albums: [makeAlbum('a1', { name: 'Beta Album' })],
      artists: [makeArtist('ar1', { name: 'Gamma Artist' })],
      songs: [makeSong('s1', { title: 'Not a library row' })],
    }
    // The full indexes also contain unstarred items; they are sorting inputs,
    // not extra members of this personal collection.
    library.albums = [makeAlbum('a1'), makeAlbum('unstarred', { starred: false })]
    library.artists = [makeArtist('ar1'), makeArtist('unstarred', { starred: false })]

    const { wrapper } = await mountView()

    expect(entryKeys(wrapper)).toEqual(
      expect.arrayContaining(['playlist:p1', 'album:a1', 'artist:ar1']),
    )
    expect(entryKeys(wrapper)).toHaveLength(3)
    expect(entryKeys(wrapper)).not.toContain('album:unstarred')
    expect(entryKeys(wrapper)).not.toContain('artist:unstarred')
    expect(wrapper.findComponent({ name: 'MobileSongRow' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Not a library row')
    expect(collectionTiles(wrapper).map((tile) => tile.props('title'))).toEqual(
      expect.arrayContaining(['Alpha Playlist', 'Beta Album', 'Gamma Artist']),
    )
  })

  it('shows one selected segment with a clear button and tapping it again returns to All', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('p1')]
    library.starred.albums = [makeAlbum('a1')]
    library.starred.artists = [makeArtist('ar1')]
    const { wrapper, router, replace } = await mountView()

    await clickSegment(wrapper, i18n.global.t('nav.albums'), replace)

    expect(entryKeys(wrapper)).toEqual(['album:a1'])
    expect(wrapper.findAll('.your-library__segment').map((button) => button.text())).toEqual([
      i18n.global.t('nav.albums'),
    ])
    expect(wrapper.findComponent({ name: 'MobileCoverTile' }).props('title')).toBe(
      i18n.global.t('nav.favorites'),
    )
    expect(collectionTiles(wrapper).map((tile) => tile.props('title'))).toEqual(['Album a1'])
    expect(replace).toHaveBeenCalledWith({ query: { segment: 'albums' } })
    await replace.mock.results.at(-1)?.value
    await flushPromises()
    expect(router.currentRoute.value.query.segment).toBe('albums')

    await clickSegment(wrapper, i18n.global.t('nav.albums'), replace)

    expect(new Set(entryKeys(wrapper))).toEqual(new Set(['playlist:p1', 'album:a1', 'artist:ar1']))
    expect(wrapper.findAll('.your-library__segment')).toHaveLength(3)
    expect(router.currentRoute.value.query.segment).toBeUndefined()

    await clickSegment(wrapper, i18n.global.t('nav.artists'), replace)
    await wrapper
      .get(`.your-library__segments [aria-label="${i18n.global.t('common.close')}"]`)
      .trigger('click')
    await replace.mock.results.at(-1)?.value
    await flushPromises()
    expect(state(wrapper).segment).toBe('all')
  })

  it('filters locally without a debounce, matching all terms across the intended fields', async () => {
    const library = useLibraryStore()
    library.playlists = [
      makePlaylist('p1', { name: 'Blue Road' }),
      makePlaylist('p2', { name: 'Red Road' }),
    ]
    library.starred.albums = [
      makeAlbum('a1', { name: 'Blue Album', artist: 'Road Artist' }),
      makeAlbum('a2', { name: 'Red Album', artist: 'Someone Else' }),
    ]
    library.starred.artists = [makeArtist('ar1', { name: 'Blue Singer' })]
    const { wrapper, router, replace } = await mountView()

    await wrapper
      .get(`.mobile-header [aria-label="${i18n.global.t('search.label')}"]`)
      .trigger('click')
    await wrapper.get('.your-library__search input').setValue('blue road')

    // No timer is advanced: the rows have already reconciled with the input.
    expect(new Set(entryKeys(wrapper))).toEqual(new Set(['playlist:p1', 'album:a1']))
    await replace.mock.results.at(-1)?.value
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('blue road')
    expect(wrapper.find('.your-library__favorites').exists()).toBe(false)

    await clickSegment(wrapper, i18n.global.t('nav.artists'), replace)
    expect(entryKeys(wrapper)).toEqual([])
    expect((wrapper.get('.your-library__search input').element as HTMLInputElement).value).toBe(
      'blue road',
    )
    expect(wrapper.findComponent({ name: 'EmptyState' }).props('title')).toBe(
      i18n.global.t('search.noResults', { query: 'blue road' }),
    )
    expect(wrapper.findComponent({ name: 'EmptyState' }).props('text')).toBe(
      i18n.global.t('search.noResultsHint'),
    )
  })

  it('focuses a newly opened search and restores its query when returning to the view', async () => {
    const library = useLibraryStore()
    library.starred.albums = [makeAlbum('a1', { name: 'Blue Album' })]
    const { wrapper, host, router, replace } = await mountView({ host: true })

    await wrapper
      .get(`.mobile-header [aria-label="${i18n.global.t('search.label')}"]`)
      .trigger('click')
    await flushPromises()
    const input = wrapper.get('.your-library__search input')
    expect(document.activeElement).toBe(input.element)

    await input.setValue('blue')
    await flushPromises()
    expect(entryKeys(wrapper)).toEqual(['album:a1'])
    await replace.mock.results.at(-1)?.value
    await flushPromises()
    expect(replace.mock.calls).toEqual([[{ query: { q: 'blue' } }]])
    expect(router.currentRoute.value.query.q).toBe('blue')

    // Opening a result unmounts this view in the real shell. The address is
    // what lets back reconstruct the same search.
    const hostState = host.vm as unknown as { show: boolean }
    await router.push('/m/albums/a1')
    hostState.show = false
    await flushPromises()
    await goBack(router)
    expect(router.currentRoute.value.query.q).toBe('blue')
    hostState.show = true
    await flushPromises()

    const returned = host.findComponent(MobileYourLibraryView)
    expect(state(returned).searchOpen).toBe(true)
    expect((returned.get('.your-library__search input').element as HTMLInputElement).value).toBe(
      'blue',
    )
    expect(entryKeys(returned)).toEqual(['album:a1'])

    await returned
      .get(`.mobile-header [aria-label="${i18n.global.t('common.close')}"]`)
      .trigger('click')
    await replace.mock.results.at(-1)?.value
    await flushPromises()
    expect(returned.find('.your-library__search').exists()).toBe(false)
    expect(router.currentRoute.value.query.q).toBeUndefined()
  })

  it('keeps Favorites first and links it to the phone favorites list in either layout', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('p1')]
    library.starred.songs = [makeSong('s1'), makeSong('s2'), makeSong('s3')]
    const { wrapper, replace } = await mountView()

    const firstTile = wrapper.findAllComponents({ name: 'MobileCoverTile' })[0]!
    expect(firstTile.props('title')).toBe(i18n.global.t('nav.favorites'))
    expect(firstTile.props('subtitle')).toBe(
      i18n.global.t('favorites.countSongs', { n: wrapper.vm.$n(3) }, 3),
    )
    expect(firstTile.find('a').attributes('href')).toBe('/m/library?favorites=1')

    await chooseLayout(wrapper, i18n.global.t('library.layoutList'))
    const firstRow = wrapper.get('.your-library__list .mobile-row')
    expect(firstRow.classes()).toContain('your-library__favorites-row')
    expect(firstRow.attributes('href')).toBe('/m/library?favorites=1')
    expect(firstRow.text()).toContain(i18n.global.t('nav.favorites'))
    expect(firstRow.text()).toContain(wrapper.vm.$n(3))

    await clickSegment(wrapper, i18n.global.t('nav.playlists'), replace)
    expect(wrapper.find('.your-library__favorites-row').exists()).toBe(false)
  })

  it('ranks recently played albums and artists before date-sorted items', async () => {
    const library = useLibraryStore()
    const recentAlbum = makeAlbum('recent', { name: 'Middle Album', created: '2020-01-01' })
    const oldAlbum = makeAlbum('old', { name: 'Beta Album', created: '2021-01-01' })
    const recentArtist = makeArtist('ar-recent', { name: 'Recent Artist' })
    const otherArtist = makeArtist('ar-other', { name: 'Other Artist' })
    library.playlists = [
      makePlaylist('new', { name: 'Zulu Playlist', changed: '2025-01-01' }),
      makePlaylist('old', { name: 'Alpha Playlist', changed: '2019-01-01' }),
    ]
    library.starred = {
      albums: [recentAlbum, oldAlbum],
      artists: [recentArtist, otherArtist],
      songs: [],
    }
    const { wrapper, library: loadedLibrary } = await mountView({
      recent: [
        recentAlbum,
        makeAlbum('recent-2', {
          artistId: 'ar-recent',
          artist: 'Recent Artist',
        }),
      ],
    })

    expect(loadedLibrary.fetchRecentlyPlayedAlbums).toHaveBeenCalled()
    expect(entryKeys(wrapper)).toEqual([
      'album:recent',
      'artist:ar-recent',
      'playlist:new',
      'album:old',
      'playlist:old',
      'artist:ar-other',
    ])
  })

  it('sorts recently added items by their dates and artists by their newest related album', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('p1', { changed: '2023-01-01' })]
    library.starred.albums = [makeAlbum('latest', { created: '2024-01-01' })]
    library.starred.artists = [
      makeArtist('ar-new', { name: 'Newest Artist' }),
      makeArtist('ar-old', { name: 'Older Artist' }),
      makeArtist('ar-null', { name: 'Undated Artist' }),
    ]
    library.albums = [
      makeAlbum('index-new', {
        artistId: 'ar-new',
        artist: 'Newest Artist',
        created: '2025-01-01',
        starred: false,
      }),
      makeAlbum('index-old', {
        artistId: 'ar-old',
        artist: 'Older Artist',
        created: '2022-01-01',
        starred: false,
      }),
      makeAlbum('index-null', {
        artistId: 'ar-null',
        artist: 'Undated Artist',
        created: 'not-a-date',
        starred: false,
      }),
    ]
    const { wrapper } = await mountView()

    await chooseSort(wrapper, 'newest')

    expect(entryKeys(wrapper)).toEqual([
      'artist:ar-new',
      'album:latest',
      'playlist:p1',
      'artist:ar-old',
      'artist:ar-null',
    ])
  })

  it('loads the album index when Artists switches to Recently added', async () => {
    const library = useLibraryStore()
    library.starred.artists = [
      makeArtist('ar-old', { name: 'Older Artist' }),
      makeArtist('ar-new', { name: 'Newer Artist' }),
    ]
    const { wrapper, library: loadedLibrary } = await mountView({
      query: { segment: 'artists' },
      configure(store) {
        vi.mocked(store.fetchAlbums).mockImplementation(async () => {
          store.albums = [
            makeAlbum('old-index', {
              artistId: 'ar-old',
              artist: 'Older Artist',
              created: '2022-01-01',
              starred: false,
            }),
            makeAlbum('new-index', {
              artistId: 'ar-new',
              artist: 'Newer Artist',
              created: '2025-01-01',
              starred: false,
            }),
          ]
        })
      },
    })
    expect(loadedLibrary.fetchAlbums).not.toHaveBeenCalled()

    await chooseSort(wrapper, 'newest')

    expect(loadedLibrary.fetchAlbums).toHaveBeenCalled()
    expect(entryKeys(wrapper)).toEqual(['artist:ar-new', 'artist:ar-old'])
  })

  it('sorts alphabetically with locale-aware comparison and null-safe date fallbacks', async () => {
    const library = useLibraryStore()
    library.playlists = [
      makePlaylist('z', { name: 'Zulu', changed: null }),
      makePlaylist('a', { name: 'Alpha', changed: 'invalid' }),
      makePlaylist('b', { name: 'Beta', changed: null }),
    ]
    const { wrapper } = await mountView()

    await chooseSort(wrapper, 'alphabetical')

    expect(entryKeys(wrapper)).toEqual(['playlist:a', 'playlist:b', 'playlist:z'])
  })

  it('switches between three-column cover tiles and the existing list rows', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('p1')]
    library.starred.albums = [makeAlbum('a1')]
    library.starred.artists = [makeArtist('ar1')]
    const { wrapper } = await mountView()

    expect(wrapper.find('.your-library__grid').exists()).toBe(true)
    expect(collectionTiles(wrapper)).toHaveLength(3)
    expect(wrapper.find('.your-library__list').exists()).toBe(false)

    await chooseLayout(wrapper, i18n.global.t('library.layoutList'))

    expect(wrapper.find('.your-library__grid').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'MobilePlaylistRow' }).props('playlist').id).toBe('p1')
    expect(wrapper.findComponent({ name: 'MobileAlbumRow' }).props('album').id).toBe('a1')
    expect(wrapper.findComponent({ name: 'MobileArtistRow' }).props('artist').id).toBe('ar1')
    expect(wrapper.findComponent({ name: 'MobileCoverTile' }).exists()).toBe(false)

    await chooseLayout(wrapper, i18n.global.t('library.layoutGrid'))
    expect(collectionTiles(wrapper)).toHaveLength(3)
  })

  it('paginates at thirty entries and resets the page when the local query changes', async () => {
    const library = useLibraryStore()
    library.playlists = Array.from({ length: 65 }, (_, index) =>
      makePlaylist(`p${index}`, { name: `Playlist ${String(index).padStart(2, '0')}` }),
    )
    const { wrapper } = await mountView()

    expect(collectionTiles(wrapper)).toHaveLength(30)
    expect(state(wrapper).hasMore).toBe(true)
    expect(wrapper.get('.your-library__more').text()).toBe(i18n.global.t('library.showMore'))

    await wrapper.get('.your-library__more button').trigger('click')
    expect(collectionTiles(wrapper)).toHaveLength(60)
    await wrapper.get('.your-library__more button').trigger('click')
    expect(collectionTiles(wrapper)).toHaveLength(65)
    expect(wrapper.find('.your-library__more').exists()).toBe(false)

    await wrapper
      .get(`.mobile-header [aria-label="${i18n.global.t('search.label')}"]`)
      .trigger('click')
    await wrapper.get('.your-library__search input').setValue('Playlist')
    expect(collectionTiles(wrapper)).toHaveLength(30)
    expect(state(wrapper).visibleCount).toBe(30)
  })

  it('remembers sort and layout per account', async () => {
    const auth = useAuthStore()
    auth.serverUrl = 'https://music.test'
    auth.username = 'first'
    auth.authenticated = true
    const library = useLibraryStore()
    library.playlists = [makePlaylist('z', { name: 'Zulu' }), makePlaylist('a', { name: 'Alpha' })]
    const first = await mountView()

    await chooseSort(first.wrapper, 'alphabetical')
    await chooseLayout(first.wrapper, i18n.global.t('library.layoutList'))
    expect(entryKeys(first.wrapper)).toEqual(['playlist:a', 'playlist:z'])
    unmount(first.wrapper)

    auth.username = 'second'
    const other = await mountView({ router: first.router })
    expect(state(other.wrapper).sort).toBe('recent')
    expect(state(other.wrapper).layout).toBe('grid')
    unmount(other.wrapper)

    auth.username = 'first'
    const returned = await mountView({ router: first.router })
    expect(state(returned.wrapper).sort).toBe('alphabetical')
    expect(state(returned.wrapper).layout).toBe('list')
    expect(
      returned.wrapper
        .findAllComponents({ name: 'MobilePlaylistRow' })
        .map((row) => row.props('playlist').name),
    ).toEqual(['Alpha', 'Zulu'])
  })

  it('opens an empty playlist dialog from plus and refreshes playlists after creation', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('p1')]
    const { wrapper } = await mountView()

    await wrapper
      .get(`.mobile-header [aria-label="${i18n.global.t('playlists.createTitle')}"]`)
      .trigger('click')
    expect(openPlaylistDialog).toHaveBeenCalledWith([])

    wrapper.findComponent({ name: 'CreatePlaylistDialog' }).vm.$emit('created')
    await flushPromises()
    expect(library.fetchPlaylists).toHaveBeenCalledWith(true)
  })

  it('uses the segment-specific empty states and the shared search empty state', async () => {
    const { wrapper, replace } = await mountView()
    const empty = () => wrapper.findComponent({ name: 'EmptyState' })

    expect(empty().props('title')).toBe(i18n.global.t('yourLibrary.emptyTitle'))
    expect(empty().props('text')).toBe(i18n.global.t('yourLibrary.emptyHint'))

    await clickSegment(wrapper, i18n.global.t('nav.albums'), replace)
    expect(empty().props('title')).toBe(i18n.global.t('favorites.noAlbumsYet'))

    await clickSegment(wrapper, i18n.global.t('nav.albums'), replace)
    await clickSegment(wrapper, i18n.global.t('nav.artists'), replace)
    expect(empty().props('title')).toBe(i18n.global.t('favorites.noArtistsYet'))

    await clickSegment(wrapper, i18n.global.t('nav.artists'), replace)
    await clickSegment(wrapper, i18n.global.t('nav.playlists'), replace)
    expect(empty().props('title')).toBe(i18n.global.t('playlists.noPlaylistsYet'))

    await wrapper
      .get(`.mobile-header [aria-label="${i18n.global.t('search.label')}"]`)
      .trigger('click')
    await wrapper.get('.your-library__search input').setValue('missing')
    expect(empty().props('title')).toBe(i18n.global.t('search.noResults', { query: 'missing' }))
    expect(empty().props('text')).toBe(i18n.global.t('search.noResultsHint'))
  })

  it('keeps successful lists visible after a partial failure and retries the failed load', async () => {
    const library = useLibraryStore()
    library.playlists = [makePlaylist('cached', { name: 'Cached Playlist' })]
    const { wrapper } = await mountView({
      configure(store) {
        vi.mocked(store.fetchStarred).mockRejectedValueOnce(new Error('offline'))
      },
    })

    expect(wrapper.find('.your-library__error').exists()).toBe(true)
    expect(wrapper.get('.your-library__error').text()).toContain(
      i18n.global.t('yourLibrary.loadFailed'),
    )
    expect(entryKeys(wrapper)).toEqual(['playlist:cached'])
    expect(wrapper.text()).toContain('Cached Playlist')

    await wrapper.get('.your-library__error button').trigger('click')
    await flushPromises()
    expect(library.fetchStarred).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.your-library__error').exists()).toBe(false)
    expect(entryKeys(wrapper)).toEqual(['playlist:cached'])
  })

  it('offers retry without replacing a total load failure with an empty state', async () => {
    const { wrapper } = await mountView({
      configure(store) {
        vi.mocked(store.fetchPlaylists).mockRejectedValueOnce(new Error('offline'))
        vi.mocked(store.fetchStarred).mockRejectedValueOnce(new Error('offline'))
      },
    })

    expect(wrapper.get('.your-library__error').text()).toContain(
      i18n.global.t('yourLibrary.loadFailed'),
    )
    expect(wrapper.get('.your-library__error button').text()).toBe(i18n.global.t('common.retry'))
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })
})
