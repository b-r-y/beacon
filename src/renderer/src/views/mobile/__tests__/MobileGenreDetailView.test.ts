import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { i18n } from '@/i18n'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import { makeSong } from '@/stores/__tests__/fixtures'
import MobileGenreDetailView from '../MobileGenreDetailView.vue'

const vuetify = createVuetify({ components, directives })
const wrappers: VueWrapper[] = []

async function mountGenre() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/m/genres/:name', component: { template: '<div />' } }],
  })
  await router.push('/m/genres/Jazz')
  await router.isReady()
  const wrapper = mount(MobileGenreDetailView, {
    global: {
      plugins: [vuetify, i18n, router],
      stubs: { CoverArt: true, MobileSongActionSheet: true },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('MobileGenreDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('loads the named genre and plays from the tapped song', async () => {
    const songs = [makeSong('s1', { genre: 'Jazz' }), makeSong('s2', { genre: 'Jazz' })]
    const library = useLibraryStore()
    vi.spyOn(library, 'fetchSongsByGenre').mockResolvedValue(songs)
    const play = vi.spyOn(usePlaybackStore(), 'playSongList').mockResolvedValue()
    const wrapper = await mountGenre()

    expect(wrapper.get('.mobile-header__title').text()).toBe('Jazz')
    expect(library.fetchSongsByGenre).toHaveBeenCalledWith('Jazz')
    await wrapper.findAllComponents({ name: 'MobileSongRow' })[1]!.trigger('click')
    expect(play).toHaveBeenCalledWith(songs, 1, false, true)
  })

  it('offers a retry after a failed load', async () => {
    const library = useLibraryStore()
    vi.spyOn(library, 'fetchSongsByGenre').mockRejectedValue(new Error('offline'))
    const wrapper = await mountGenre()

    expect(wrapper.text()).toContain(i18n.global.t('explore.loadFailed'))
    const retry = wrapper
      .findAll('button')
      .find((button) => button.text() === i18n.global.t('common.retry'))
    expect(retry).toBeDefined()
  })
})
