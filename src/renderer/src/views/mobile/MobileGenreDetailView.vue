<template>
  <v-container fluid>
    <div class="mobile-header">
      <h1 class="page-title mobile-header__title">{{ genre }}</h1>
      <v-btn
        icon="mdi-shuffle-variant"
        variant="text"
        :disabled="!songs.length"
        :title="$t('explore.shuffleAll')"
        :aria-label="$t('explore.shuffleAll')"
        @click="playShuffled"
      />
      <v-btn
        icon="mdi-play-circle"
        color="primary"
        size="large"
        variant="text"
        :disabled="!songs.length"
        :title="$t('explore.playAll')"
        :aria-label="$t('explore.playAll')"
        @click="playAll"
      />
    </div>

    <v-progress-circular
      v-if="loading && !songs.length"
      indeterminate
      color="primary"
      class="view-notice"
    />
    <v-alert v-else-if="error" type="error" variant="tonal" class="view-notice">
      {{ $t('explore.loadFailed') }}
      <v-btn variant="text" size="small" @click="loadGenre">{{ $t('common.retry') }}</v-btn>
    </v-alert>
    <div v-else-if="songs.length" class="mobile-genre__list">
      <v-virtual-scroll renderless :items="songs" :item-height="MOBILE_ROW_HEIGHT">
        <template #default="{ item: song, index }">
          <mobile-song-row
            :key="song.id"
            :song="song"
            @play="play(index)"
            @open-actions="openActions(song)"
          />
        </template>
      </v-virtual-scroll>
    </div>
    <empty-state v-else icon="mdi-music-note-off" :title="$t('library.noSongsFound')" />

    <mobile-song-action-sheet v-model="actionsOpen" :song="activeSong" />
  </v-container>
</template>

<script lang="ts">
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import EmptyState from '@/components/EmptyState.vue'
import MobileSongRow from '@/components/mobile/MobileSongRow.vue'
import MobileSongActionSheet from '@/components/mobile/MobileSongActionSheet.vue'
import { MOBILE_ROW_HEIGHT } from '@/components/mobile/rowMetrics'
import type { Song } from '@/types/library'

export default {
  name: 'MobileGenreDetailView',
  components: { EmptyState, MobileSongRow, MobileSongActionSheet },
  data() {
    return {
      MOBILE_ROW_HEIGHT,
      songs: [] as Song[],
      loading: false,
      error: false,
      actionsOpen: false,
      activeSong: null as Song | null,
    }
  },
  computed: {
    libraryStore() {
      return useLibraryStore()
    },
    playbackStore() {
      return usePlaybackStore()
    },
    genre(): string {
      const value = this.$route.params.name
      return typeof value === 'string' ? value : ''
    },
  },
  watch: {
    '$route.params.name': 'loadGenre',
  },
  created() {
    void this.loadGenre()
  },
  methods: {
    async loadGenre() {
      this.loading = true
      this.error = false
      try {
        this.songs = await this.libraryStore.fetchSongsByGenre(this.genre)
      } catch (error) {
        this.error = true
        console.error('[mobile-genre] Loading failed:', error)
      } finally {
        this.loading = false
      }
    },
    async playAll() {
      await this.playbackStore.playSongList(this.songs, 0, false, this.songs.length > 1)
    },
    async playShuffled() {
      const songs = [...this.songs]
      for (let i = songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[songs[i], songs[j]] = [songs[j]!, songs[i]!]
      }
      await this.playbackStore.playSongList(songs, 0, false, songs.length > 1)
    },
    async play(index: number) {
      await this.playbackStore.playSongList(this.songs, index, false, this.songs.length > 1)
    },
    openActions(song: Song) {
      this.activeSong = song
      this.actionsOpen = true
    },
  },
}
</script>

<style scoped>
.mobile-genre__list {
  display: flex;
  flex-direction: column;
}
</style>
