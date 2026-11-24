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
import type { Album, Playlist } from '@/types/library'
import MobileExploreView from '../MobileExploreView.vue'

const vuetify = createVuetify({ components, directives })
const wrappers: VueWrapper[] = []

function album(id: string, name: string, overrides: Partial<Album> = {}): Album {
  return {
    id,
    name,
    artist: `Artist ${id}`,
    artistId: `artist-${id}`,
    coverArtId: `cover-${id}`,
    songCount: 1,
    duration: 180,
    year: 2024,
    genre: 'Jazz',
    starred: false,
    rating: 0,
    songs: [],
    ...overrides,
  }
}

function playlist(id: string, name: string): Playlist {
  return {
    id,
    name,
    songCount: 1,
    duration: 180,
    coverArtId: null,
    public: false,
    owner: 'listener',
    changed: '2026-01-01T00:00:00Z',
    readonly: false,
    smart: false,
    songs: [],
  }
}

function stubStore() {
  const library = useLibraryStore()
  vi.spyOn(library, 'fetchPlaylists').mockResolvedValue()
  vi.spyOn(library, 'fetchAlbums').mockResolvedValue()
  vi.spyOn(library, 'fetchArtists').mockResolvedValue()
  vi.spyOn(library, 'fetchAllSongs').mockResolvedValue()
  vi.spyOn(library, 'fetchGenres').mockResolvedValue()
  vi.spyOn(library, 'fetchRadioStations').mockResolvedValue()
  vi.spyOn(library, 'fetchRecentlyPlayedAlbums').mockResolvedValue([])
  vi.spyOn(library, 'fetchFrequentAlbums').mockResolvedValue([])
  vi.spyOn(library, 'fetchAlbum').mockImplementation(async (id) =>
    album(id, `Full ${id}`, { songs: [makeSong(`song-${id}`)] }),
  )
  vi.spyOn(library, 'fetchPlaylist').mockImplementation(async (id) => playlist(id, `Full ${id}`))
  vi.spyOn(library, 'client').mockReturnValue({
    getAlbumList2: vi.fn().mockResolvedValue([]),
  } as unknown as ReturnType<typeof library.client>)
  return library
}

async function mountExplore(path = '/m/explore') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(MobileExploreView, {
    global: {
      plugins: [vuetify, i18n, router],
      stubs: {
        CoverArt: true,
        MobileSongActionSheet: true,
        RadioDiscoverDialog: true,
        TileContextMenu: true,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

async function chooseSection(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('.mobile-explore__section').find((item) => item.text() === label)
  expect(button, `section ${label}`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

describe('MobileExploreView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().capabilities.internetRadio = true
    localStorage.clear()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('opens on Albums and offers the supported Resonus sections in order', async () => {
    const library = stubStore()
    library.albums = [album('a1', 'Blue Album')]
    const { wrapper } = await mountExplore()

    expect(wrapper.get('.mobile-header__title').text()).toBe(i18n.global.t('mobile.tabExplore'))
    expect(wrapper.findAll('.mobile-explore__section').map((item) => item.text())).toEqual([
      i18n.global.t('nav.playlists'),
      i18n.global.t('nav.albums'),
      i18n.global.t('nav.artists'),
      i18n.global.t('nav.songs'),
      i18n.global.t('nav.genres'),
      i18n.global.t('nav.radio'),
    ])
    expect(library.fetchAlbums).toHaveBeenCalled()
    const tile = wrapper.getComponent({ name: 'MobileCoverTile' })
    expect(tile.props('to')).toBe('/m/albums/a1')
    expect(tile.props('title')).toBe('Blue Album')
  })

  it('loads only the selected browser and filters it after the debounce', async () => {
    vi.useFakeTimers()
    const library = stubStore()
    library.allSongs = [
      makeSong('s1', { title: 'Blue Song', artist: 'Someone' }),
      makeSong('s2', { title: 'Red Song', artist: 'Someone' }),
    ]
    const { wrapper, router } = await mountExplore()

    await chooseSection(wrapper, i18n.global.t('nav.songs'))
    await vi.advanceTimersByTimeAsync(0)
    expect(library.fetchAllSongs).toHaveBeenCalled()
    expect(router.currentRoute.value.query.section).toBe('songs')

    await wrapper.get(`[aria-label="${i18n.global.t('search.label')}"]`).trigger('click')
    await wrapper.get('input[type="text"]').setValue('blue')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'MobileSongRow' })).toHaveLength(1)
    expect(wrapper.getComponent({ name: 'MobileSongRow' }).props('song').id).toBe('s1')
  })

  it('switches between grid and list and remembers the choice per section', async () => {
    const library = stubStore()
    library.albums = [album('a1', 'One'), album('a2', 'Two')]
    const { wrapper } = await mountExplore()

    expect(wrapper.find('.mobile-explore__grid').exists()).toBe(true)
    wrapper.vm.setLayout('list')
    await flushPromises()

    expect(wrapper.find('.mobile-explore__list').exists()).toBe(true)
    expect(wrapper.findAllComponents({ name: 'MobileAlbumRow' })).toHaveLength(2)
    expect(localStorage.getItem('beacon.mobileExplore.preferences')).toContain('"layout":"list"')
  })

  it('plays one song on tap and the filtered sequence from Play all', async () => {
    const library = stubStore()
    const songs = [makeSong('s1', { title: 'One' }), makeSong('s2', { title: 'Two' })]
    library.allSongs = songs
    const play = vi.spyOn(usePlaybackStore(), 'playSongList').mockResolvedValue()
    const { wrapper } = await mountExplore('/m/explore?section=songs')

    await wrapper.findAllComponents({ name: 'MobileSongRow' })[1]!.trigger('click')
    expect(play).toHaveBeenLastCalledWith([songs[1]], 0)

    await wrapper.get(`[aria-label="${i18n.global.t('explore.playAll')}"]`).trigger('click')
    await flushPromises()
    expect(play).toHaveBeenLastCalledWith(songs, 0, false, true)
  })

  it('links every genre to its phone detail page', async () => {
    const library = stubStore()
    library.allSongs = [makeSong('s1', { genre: 'Jazz' })]
    library.albums = [album('a1', 'Blue', { genre: 'Jazz' })]
    const { wrapper } = await mountExplore('/m/explore?section=genres')

    const tile = wrapper.getComponent({ name: 'MobileCoverTile' })
    expect(tile.props('title')).toBe('Jazz')
    expect(tile.props('to')).toBe('/m/genres/Jazz')
  })

  it('keeps Radio out when the server has no radio capability', async () => {
    stubStore()
    useAuthStore().capabilities.internetRadio = false
    const { wrapper } = await mountExplore('/m/explore?section=radio')

    expect(wrapper.findAll('.mobile-explore__section').map((item) => item.text())).not.toContain(
      i18n.global.t('nav.radio'),
    )
  })

  it('shows a retryable error when the selected catalogue cannot load', async () => {
    const library = stubStore()
    vi.mocked(library.fetchAlbums).mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountExplore()

    expect(wrapper.text()).toContain(i18n.global.t('explore.loadFailed'))
    const retry = wrapper
      .findAll('button')
      .find((button) => button.text() === i18n.global.t('common.retry'))
    expect(retry).toBeDefined()
  })
})
