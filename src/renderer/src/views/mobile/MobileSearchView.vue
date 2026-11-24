<template>
  <v-container fluid class="mobile-search">
    <div class="mobile-header">
      <h1 class="page-title mobile-header__title">{{ $t('mobile.tabSearch') }}</h1>
    </div>

    <sticky-filter>
      <v-text-field
        v-model="filterQuery"
        :label="$t('search.label')"
        :placeholder="$t('search.whatToListenTo')"
        prepend-inner-icon="mdi-magnify"
        variant="solo-filled"
        density="compact"
        clearable
        hide-details
        autocomplete="off"
        class="mobile-search__field"
      >
        <template #append-inner>
          <exact-match-switch />
        </template>
      </v-text-field>

      <div
        v-if="hasQuery"
        class="mobile-search__filters"
        role="group"
        :aria-label="$t('search.label')"
      >
        <v-btn
          v-for="option in filterOptions"
          :key="option.value"
          class="mobile-search__filter"
          size="small"
          rounded="pill"
          :variant="selectedFilter === option.value ? 'tonal' : 'text'"
          :color="selectedFilter === option.value ? 'primary' : undefined"
          :aria-pressed="selectedFilter === option.value"
          @click="selectedFilter = option.value"
        >
          {{ option.title }}
        </v-btn>
      </div>
    </sticky-filter>

    <section v-if="!hasQuery && recentSearches.length" class="mobile-search__recents">
      <div class="mobile-search__heading">
        <h2 class="section-title">{{ $t('search.recentSearches') }}</h2>
        <v-btn variant="text" size="small" color="primary" @click="clearRecents">
          {{ $t('search.clearRecent') }}
        </v-btn>
      </div>
      <div class="mobile-search__recent-list">
        <div
          v-for="recent in recentSearches"
          :key="`${recent.kind}:${recent.id}`"
          class="mobile-row"
        >
          <router-link :to="recent.to" class="mobile-search__recent-link">
            <cover-art
              :cover-art-id="recent.coverArtId"
              :size="MOBILE_ROW_ART_SIZE"
              :rounded="recent.kind === 'artist'"
              :fallback-icon="recent.kind === 'artist' ? 'mdi-account-music' : 'mdi-album'"
              class="mobile-row__art"
            />
            <span class="mobile-row__text">
              <span class="text-body-medium">{{ recent.name }}</span>
              <span class="text-body-small text-medium-emphasis">{{ recent.subtitle }}</span>
            </span>
          </router-link>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            class="mobile-search__recent-remove"
            :title="`${$t('search.removeRecent')}: ${recent.name}`"
            :aria-label="`${$t('search.removeRecent')}: ${recent.name}`"
            @click.stop="removeRecent(recent)"
          />
        </div>
      </div>
    </section>

    <empty-state
      v-else-if="!hasQuery"
      icon="mdi-magnify"
      :title="$t('search.searchYourMusic')"
      :text="$t('search.searchYourMusicHint')"
    />

    <div v-if="isSearchTerm && searching" class="mobile-search__loading" role="status">
      <v-progress-circular indeterminate color="primary" />
      <span>{{ $t('search.searching') }}</span>
    </div>

    <template v-if="isSearchTerm && !searching">
      <div v-if="searchFailed" class="mobile-search__error">
        <v-alert type="error" variant="tonal">{{ $t('search.failed') }}</v-alert>
        <v-btn variant="text" color="primary" @click="retrySearch">
          {{ $t('common.retry') }}
        </v-btn>
      </div>

      <section v-if="showArtists" class="mobile-search__section">
        <h2 class="section-title mobile-search__section-title">{{ $t('nav.artists') }}</h2>
        <v-slide-group v-if="selectedFilter === 'all'" class="mobile-search__shelf">
          <div
            v-for="artist in results.artists"
            :key="artist.id"
            class="mobile-search__shelf-item"
            @click="rememberArtist(artist)"
          >
            <mobile-cover-tile
              :title="artist.name"
              :subtitle="artistSubtitle(artist)"
              :to="`/m/artists/${artist.id}`"
              :cover-art-id="artist.coverArtId"
              :image-url="artist.imageUrl"
              fallback-icon="mdi-account-music"
              round
            />
          </div>
        </v-slide-group>
        <div v-else class="mobile-search__grid">
          <div
            v-for="artist in results.artists"
            :key="artist.id"
            class="mobile-search__tile"
            @click="rememberArtist(artist)"
          >
            <mobile-cover-tile
              :title="artist.name"
              :subtitle="artistSubtitle(artist)"
              :to="`/m/artists/${artist.id}`"
              :cover-art-id="artist.coverArtId"
              :image-url="artist.imageUrl"
              fallback-icon="mdi-account-music"
              round
            />
          </div>
        </div>
      </section>

      <section v-if="showAlbums" class="mobile-search__section">
        <h2 class="section-title mobile-search__section-title">{{ $t('nav.albums') }}</h2>
        <v-slide-group v-if="selectedFilter === 'all'" class="mobile-search__shelf">
          <div
            v-for="album in results.albums"
            :key="album.id"
            class="mobile-search__shelf-item"
            @click="rememberAlbum(album)"
          >
            <mobile-cover-tile
              :title="album.name"
              :subtitle="album.artist"
              :to="`/m/albums/${album.id}`"
              :cover-art-id="album.coverArtId"
            />
          </div>
        </v-slide-group>
        <div v-else class="mobile-search__grid">
          <div
            v-for="album in results.albums"
            :key="album.id"
            class="mobile-search__tile"
            @click="rememberAlbum(album)"
          >
            <mobile-cover-tile
              :title="album.name"
              :subtitle="album.artist"
              :to="`/m/albums/${album.id}`"
              :cover-art-id="album.coverArtId"
            />
          </div>
        </div>
      </section>

      <section v-if="showSongs" class="mobile-search__section">
        <h2 class="section-title mobile-search__section-title">{{ $t('nav.songs') }}</h2>
        <div class="mobile-search__rows">
          <mobile-song-row
            v-for="song in results.songs"
            :key="song.id"
            :song="song"
            @play="playSong(song)"
            @open-actions="openActions(song)"
          />
        </div>
      </section>

      <section v-if="showPlaylists" class="mobile-search__section">
        <h2 class="section-title mobile-search__section-title">{{ $t('nav.playlists') }}</h2>
        <div class="mobile-search__rows">
          <mobile-playlist-row
            v-for="playlist in filteredPlaylists"
            :key="playlist.id"
            :playlist="playlist"
            @play="playPlaylist(playlist)"
          />
        </div>
      </section>

      <section v-if="showRadio" class="mobile-search__section">
        <h2 class="section-title mobile-search__section-title">{{ $t('nav.radio') }}</h2>
        <div class="mobile-search__rows">
          <mobile-radio-row
            v-for="station in filteredRadioStations"
            :key="station.id"
            :station="station"
            :show-menu="false"
            @play="playRadio(station)"
          />
        </div>
      </section>

      <empty-state
        v-if="!searchFailed && !hasResults"
        icon="mdi-magnify-close"
        :title="$t('search.noResults', { query: debouncedQuery })"
        :text="$t('search.noResultsHint')"
      />
    </template>

    <mobile-song-action-sheet v-model="actionsOpen" :song="activeSong" />
  </v-container>
</template>

<script lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import EmptyState from '@/components/EmptyState.vue'
import ExactMatchSwitch from '@/components/library/ExactMatchSwitch.vue'
import MobileCoverTile from '@/components/mobile/MobileCoverTile.vue'
import { MOBILE_ROW_ART_SIZE } from '@/components/mobile/rowMetrics'
import MobileSongRow from '@/components/mobile/MobileSongRow.vue'
import MobileSongActionSheet from '@/components/mobile/MobileSongActionSheet.vue'
import MobilePlaylistRow from '@/components/mobile/MobilePlaylistRow.vue'
import MobileRadioRow from '@/components/mobile/MobileRadioRow.vue'
import StickyFilter from '@/components/StickyFilter.vue'
import {
  add as addRecentSearch,
  clear as clearRecentSearches,
  load as loadRecentSearches,
  remove as removeRecentSearch,
  type RecentSearch,
} from '@/services/recentSearches'
import { matchesAllTerms } from '@/services/textSearch'
import type { Album, Artist, Playlist, RadioStation, Song } from '@/types/library'

type SearchFilter = 'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'radio'

interface SearchResults {
  artists: Artist[]
  albums: Album[]
  songs: Song[]
}

interface FilterOption {
  title: string
  value: SearchFilter
}

const SEARCH_DELAY = 350
const MIN_SEARCH_LENGTH = 2

function emptyResults(): SearchResults {
  return { artists: [], albums: [], songs: [] }
}

export default {
  name: 'MobileSearchView',
  components: {
    EmptyState,
    ExactMatchSwitch,
    MobileCoverTile,
    MobileSongRow,
    MobileSongActionSheet,
    MobilePlaylistRow,
    MobileRadioRow,
    StickyFilter,
  },
  data() {
    return {
      MOBILE_ROW_ART_SIZE,
      filterQuery: '',
      debouncedQuery: '',
      selectedFilter: 'all' as SearchFilter,
      results: emptyResults(),
      recentSearches: [] as RecentSearch[],
      searching: false,
      searchFailed: false,
      searchRequest: 0,
      debounceTimer: null as ReturnType<typeof setTimeout> | null,
      pendingRouteQuery: null as string | null,
      actionsOpen: false,
      activeSong: null as Song | null,
    }
  },
  computed: {
    libraryStore() {
      return useLibraryStore()
    },
    authStore() {
      return useAuthStore()
    },
    trimmedQuery(): string {
      return this.filterQuery.trim()
    },
    hasQuery(): boolean {
      return this.trimmedQuery.length > 0
    },
    isSearchTerm(): boolean {
      return this.trimmedQuery.length >= MIN_SEARCH_LENGTH
    },
    canUseRadio(): boolean {
      return this.authStore.capabilities.internetRadio
    },
    filterOptions(): FilterOption[] {
      const options: FilterOption[] = [
        { title: this.$t('playlists.segmentAll'), value: 'all' },
        { title: this.$t('nav.songs'), value: 'songs' },
        { title: this.$t('nav.artists'), value: 'artists' },
        { title: this.$t('nav.albums'), value: 'albums' },
        { title: this.$t('nav.playlists'), value: 'playlists' },
      ]
      if (this.canUseRadio) options.push({ title: this.$t('nav.radio'), value: 'radio' })
      return options
    },
    filteredPlaylists(): Playlist[] {
      return this.libraryStore.playlists.filter((playlist: Playlist) =>
        matchesAllTerms(this.debouncedQuery, [playlist.name], { exact: true }),
      )
    },
    filteredRadioStations(): RadioStation[] {
      if (!this.canUseRadio) return []
      return this.libraryStore.radioStations.filter((station: RadioStation) =>
        matchesAllTerms(this.debouncedQuery, [station.name], { exact: true }),
      )
    },
    showArtists(): boolean {
      return (
        !this.searchFailed &&
        (this.selectedFilter === 'all' || this.selectedFilter === 'artists') &&
        this.results.artists.length > 0
      )
    },
    showAlbums(): boolean {
      return (
        !this.searchFailed &&
        (this.selectedFilter === 'all' || this.selectedFilter === 'albums') &&
        this.results.albums.length > 0
      )
    },
    showSongs(): boolean {
      return (
        !this.searchFailed &&
        (this.selectedFilter === 'all' || this.selectedFilter === 'songs') &&
        this.results.songs.length > 0
      )
    },
    showPlaylists(): boolean {
      return (
        (this.selectedFilter === 'all' || this.selectedFilter === 'playlists') &&
        this.filteredPlaylists.length > 0
      )
    },
    showRadio(): boolean {
      return (
        this.canUseRadio &&
        (this.selectedFilter === 'all' || this.selectedFilter === 'radio') &&
        this.filteredRadioStations.length > 0
      )
    },
    hasResults(): boolean {
      if (this.selectedFilter === 'all') {
        return (
          this.results.artists.length > 0 ||
          this.results.albums.length > 0 ||
          this.results.songs.length > 0 ||
          this.filteredPlaylists.length > 0 ||
          this.filteredRadioStations.length > 0
        )
      }
      if (this.selectedFilter === 'artists') return this.results.artists.length > 0
      if (this.selectedFilter === 'albums') return this.results.albums.length > 0
      if (this.selectedFilter === 'songs') return this.results.songs.length > 0
      if (this.selectedFilter === 'playlists') return this.filteredPlaylists.length > 0
      return this.filteredRadioStations.length > 0
    },
  },
  watch: {
    filterQuery(value: string | null) {
      const term = (value ?? '').trim()
      // applyRouteQuery() has already started this complete term immediately.
      if (term === this.debouncedQuery) return
      this.queueSearch(term)
    },
    canUseRadio(supported: boolean) {
      if (!supported && this.selectedFilter === 'radio') this.selectedFilter = 'all'
    },
    'libraryStore.searchExact'() {
      if (this.debouncedQuery.length >= MIN_SEARCH_LENGTH) this.searchNow(this.debouncedQuery)
    },
    // Vue Router reuses this view for a new ?q, including a hand-over from
    // the shell while the tab is already open.
    '$route.query.q': 'applyRouteQuery',
  },
  created() {
    this.recentSearches = loadRecentSearches()
    this.applyRouteQuery()
    void this.libraryStore.fetchPlaylists().catch(() => undefined)
    if (this.canUseRadio) {
      void this.libraryStore.fetchRadioStations().catch(() => undefined)
    }
  },
  beforeUnmount() {
    this.cancelDebounce()
    this.searchRequest++
  },
  methods: {
    artistSubtitle(artist: Artist): string {
      const count = this.$n(artist.albumCount)
      return artist.albumCount === 1
        ? `${count} ${this.$t('library.album1')}`
        : `${count} ${this.$t('library.albumsN')}`
    },
    copyResults(): SearchResults {
      const results = this.libraryStore.searchResults
      return {
        artists: [...results.artists],
        albums: [...results.albums],
        songs: [...results.songs],
      }
    },
    restoreAppliedResults() {
      this.libraryStore.searchResults = this.copyLocalResults()
    },
    copyLocalResults(): SearchResults {
      return {
        artists: [...this.results.artists],
        albums: [...this.results.albums],
        songs: [...this.results.songs],
      }
    },
    cancelDebounce() {
      if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    },
    queueSearch(term: string) {
      this.cancelDebounce()
      const request = ++this.searchRequest
      this.results = emptyResults()
      this.debouncedQuery = ''
      this.searchFailed = false

      if (term.length < MIN_SEARCH_LENGTH) {
        this.searching = false
        this.persistQuery('')
        return
      }

      this.searching = true
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        this.debouncedQuery = term
        this.persistQuery(term)
        void this.runSearch(term, request)
      }, SEARCH_DELAY)
    },
    async runSearch(term: string, request: number) {
      try {
        await this.libraryStore.search(term)
        if (request !== this.searchRequest) {
          // search() writes the shared store before resolving. Put back the
          // newest applied answer when an older request finishes last.
          this.restoreAppliedResults()
          return
        }
        this.results = this.copyResults()
      } catch {
        if (request !== this.searchRequest) {
          this.restoreAppliedResults()
          return
        }
        this.results = emptyResults()
        this.searchFailed = true
      } finally {
        if (request === this.searchRequest) this.searching = false
      }
    },
    searchNow(term: string) {
      this.cancelDebounce()
      const request = ++this.searchRequest
      this.debouncedQuery = term
      this.results = emptyResults()
      this.searchFailed = false
      if (term.length < MIN_SEARCH_LENGTH) {
        this.searching = false
        return
      }
      this.searching = true
      this.persistQuery(term)
      void this.runSearch(term, request)
    },
    retrySearch() {
      this.searchNow(this.trimmedQuery)
    },
    applyRouteQuery() {
      const value = this.$route?.query?.q
      const term = typeof value === 'string' ? value.trim() : ''
      if (this.pendingRouteQuery !== null && term === this.pendingRouteQuery) {
        this.pendingRouteQuery = null
        return
      }
      this.pendingRouteQuery = null
      if (term === this.filterQuery.trim() && term === this.debouncedQuery) return

      this.cancelDebounce()
      const request = ++this.searchRequest
      this.filterQuery = term
      this.debouncedQuery = term
      this.results = emptyResults()
      this.searchFailed = false
      this.searching = term.length >= MIN_SEARCH_LENGTH
      if (this.searching) void this.runSearch(term, request)
    },
    persistQuery(term: string) {
      if (!this.$router || !this.$route) return
      const query: Record<string, string> = {}
      for (const [key, value] of Object.entries(this.$route.query)) {
        if (typeof value === 'string') query[key] = value
      }
      if (term) query.q = term
      else delete query.q
      if ((this.$route.query.q ?? '') === term) return
      this.pendingRouteQuery = term
      void this.$router.replace({ query }).catch(() => {
        if (this.pendingRouteQuery === term) this.pendingRouteQuery = null
      })
    },
    rememberRecent(entry: RecentSearch) {
      addRecentSearch(entry)
      this.recentSearches = loadRecentSearches()
    },
    rememberArtist(artist: Artist) {
      this.rememberRecent({
        kind: 'artist',
        id: artist.id,
        name: artist.name,
        subtitle: this.artistSubtitle(artist),
        to: `/m/artists/${artist.id}`,
        coverArtId: artist.coverArtId ?? artist.id,
      })
    },
    rememberAlbum(album: Album) {
      this.rememberRecent({
        kind: 'album',
        id: album.id,
        name: album.name,
        subtitle: album.artist,
        to: `/m/albums/${album.id}`,
        coverArtId: album.coverArtId ?? album.id,
      })
    },
    rememberSong(song: Song) {
      if (!song.albumId) return
      this.rememberRecent({
        kind: 'song',
        id: song.id,
        name: song.title,
        subtitle: song.artist,
        to: `/m/albums/${song.albumId}`,
        coverArtId: song.coverArtId ?? song.albumId,
      })
    },
    removeRecent(recent: RecentSearch) {
      removeRecentSearch(recent.kind, recent.name)
      this.recentSearches = loadRecentSearches()
    },
    clearRecents() {
      clearRecentSearches()
      this.recentSearches = []
    },
    async playSong(song: Song) {
      this.rememberSong(song)
      await usePlaybackStore().playSongList([song], 0)
    },
    async playPlaylist(playlist: Playlist) {
      const full = await this.libraryStore.fetchPlaylist(playlist.id)
      await usePlaybackStore().playSongList(full.songs, 0, false)
    },
    playRadio(station: RadioStation) {
      void usePlaybackStore().playRadioStation(station)
    },
    openActions(song: Song) {
      this.activeSong = song
      this.actionsOpen = true
    },
  },
}
</script>

<style scoped>
/* Phone browsers zoom a focused input below 16px and do not zoom back out. */
.mobile-search__field :deep(input) {
  font-size: 16px;
}

.mobile-search__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.mobile-search__filter {
  flex: 0 0 auto;
  font-weight: 600;
  letter-spacing: normal;
  text-transform: none;
}

.mobile-search__heading,
.mobile-search__error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-search__heading {
  margin-bottom: 4px;
}

.mobile-search__heading h2 {
  flex: 1;
  min-width: 0;
}

.mobile-search__recent-list,
.mobile-search__rows {
  display: flex;
  flex-direction: column;
}

.mobile-search__recent-link {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.mobile-search__recent-link:hover,
.mobile-search__recent-link:active {
  background: var(--beacon-hover);
}

.mobile-search__recent-remove {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.mobile-search__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 0;
}

.mobile-search__error {
  margin-bottom: 20px;
}

.mobile-search__error .v-alert {
  flex: 1;
}

.mobile-search__section {
  margin-top: 22px;
}

.mobile-search__section-title {
  margin-bottom: 10px;
}

/* The cover fills its parent, so a shelf item needs a real width rather than
 * relying on the artwork's intrinsic size. */
.mobile-search__shelf-item {
  flex: 0 0 128px;
  width: 128px;
}

.mobile-search__shelf {
  margin: 0 -16px;
}

.mobile-search__shelf :deep(.v-slide-group__content) {
  gap: 12px;
  padding: 0 16px;
}

.mobile-search__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px 12px;
}

.mobile-search__tile {
  min-width: 0;
  cursor: pointer;
}

@media (max-width: 340px) {
  .mobile-search__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
