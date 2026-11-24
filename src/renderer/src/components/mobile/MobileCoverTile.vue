<template>
  <div class="mobile-cover-tile" :class="{ 'mobile-cover-tile--round': round }">
    <div class="mobile-cover-tile__art">
      <button
        v-if="playable"
        type="button"
        class="mobile-cover-tile__target"
        :aria-label="`${$t('library.play')}: ${title}`"
        @click="$emit('play')"
      >
        <cover-art
          :cover-art-id="coverArtId"
          :image-url="imageUrl"
          :radio-favicon="radioFavicon"
          :size="'100%'"
          :rounded="round"
          :fallback-icon="fallbackIcon"
        />
        <v-icon icon="mdi-play" class="mobile-cover-tile__play" />
      </button>
      <router-link v-else :to="to" class="mobile-cover-tile__target" :aria-label="title">
        <cover-art
          :cover-art-id="coverArtId"
          :image-url="imageUrl"
          :radio-favicon="radioFavicon"
          :size="'100%'"
          :rounded="round"
          :fallback-icon="fallbackIcon"
        />
      </router-link>
    </div>
    <router-link :to="to" class="mobile-cover-tile__text">
      <span class="mobile-cover-tile__title text-body-small">{{ title }}</span>
      <span v-if="subtitle" class="text-body-small text-medium-emphasis">{{ subtitle }}</span>
    </router-link>
  </div>
</template>

<script lang="ts">
import type { PropType } from 'vue'
import CoverArt from '@/components/library/CoverArt.vue'
import type { RadioFaviconRequest } from '@/services/connect/radio'

/** The common cover-and-two-lines tile used by Search, Explore and Your
 *  library. Collections open on a tap; a playable tile gives its cover the
 *  same play action as MobileAlbumTile, leaving the name as the link. */
export default {
  name: 'MobileCoverTile',
  components: { CoverArt },
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    to: { type: String, required: true },
    coverArtId: { type: String as PropType<string | null>, default: null },
    imageUrl: { type: String as PropType<string | null>, default: null },
    radioFavicon: { type: Object as PropType<RadioFaviconRequest | null>, default: null },
    fallbackIcon: { type: String, default: 'mdi-album' },
    round: { type: Boolean, default: false },
    playable: { type: Boolean, default: false },
  },
  emits: ['play'],
}
</script>

<style scoped>
.mobile-cover-tile {
  min-width: 0;
}

.mobile-cover-tile__art {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
}

.mobile-cover-tile__target {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.mobile-cover-tile--round .mobile-cover-tile__target {
  border-radius: 50%;
}

.mobile-cover-tile__play {
  position: absolute;
  inset: 0;
  width: 38px;
  height: 38px;
  margin: auto;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  font-size: 24px;
}

.mobile-cover-tile__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin-top: 6px;
  color: inherit;
  text-decoration: none;
}

.mobile-cover-tile__text > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-cover-tile__title {
  font-weight: 600;
}
</style>
