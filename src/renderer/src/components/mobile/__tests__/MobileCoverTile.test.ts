import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { i18n } from '@/i18n'
import MobileCoverTile from '../MobileCoverTile.vue'

const vuetify = createVuetify({ components, directives })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

function mountTile(props: Record<string, unknown> = {}) {
  return mount(MobileCoverTile, {
    props: { title: 'Blue Album', subtitle: 'Someone', to: '/m/albums/a1', ...props },
    global: { plugins: [vuetify, i18n, router], stubs: { CoverArt: true } },
  })
}

describe('MobileCoverTile', () => {
  it('opens a collection from its cover and name', () => {
    const wrapper = mountTile()

    expect(wrapper.get('.mobile-cover-tile__target').attributes('href')).toBe('/m/albums/a1')
    expect(wrapper.get('.mobile-cover-tile__text').attributes('href')).toBe('/m/albums/a1')
    expect(wrapper.find('.mobile-cover-tile__play').exists()).toBe(false)
  })

  it('gives a playable cover the play action and leaves the name as the link', async () => {
    const wrapper = mountTile({ playable: true })

    await wrapper.get('.mobile-cover-tile__target').trigger('click')

    expect(wrapper.emitted('play')).toHaveLength(1)
    expect(wrapper.get('.mobile-cover-tile__target').element.tagName).toBe('BUTTON')
    expect(wrapper.get('.mobile-cover-tile__text').attributes('href')).toBe('/m/albums/a1')
  })
})
