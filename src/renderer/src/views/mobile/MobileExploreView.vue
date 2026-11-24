<template>
  <v-container fluid class="mobile-explore">
    <div class="mobile-header">
      <h1 class="page-title mobile-header__title">{{ $t('mobile.tabExplore') }}</h1>
      <v-btn
        :icon="searchOpen ? 'mdi-close' : 'mdi-magnify'"
        variant="text"
        :title="searchOpen ? $t('common.close') : $t('search.label')"
        :aria-label="searchOpen ? $t('common.close') : $t('search.label')"
        @click="toggleSearch"
      />
      <v-btn
        v-if="section === 'radio'"
        icon="mdi-compass-outline"
        color="primary"
        variant="tonal"
        :title="$t('radio.discoverStations')"
        :aria-label="$t('radio.discoverStations')"
        @click="discoverOpen = true"
      />
    </div>

    <!-- One catalogue browser at a time, as in Resonus: the section chips
       - choose the body below rather than stacking every library on one page. -->
    <v-slide-group class="mobile-explore__sections" show-arrows>
      <v-btn
        v-for="item in sectionOptions"
        :key="item.value"
        class="mobile-explore__section"
        :class="{ 'mobile-explore__section--active': section === item.value }"
        :aria-pressed="section === item.value"
        variant="text"
        @click="selectSection(item.value)"
      >
        {{ item.title }}
      </v-btn>
    </v-slide-group>

    <sticky-filter v-if="searchOpen">
      <v-text-field
        v-model="query"
        :label="$t('search.label')"
        :placeholder="$t('search.label')"
        prepend-inner-icon="mdi-magnify"
        variant="solo-filled"
        density="compact"
        rounded="pill"
        flat
        clearable
        hide-details
      />
    </sticky-filter>

    <div class="mobile-explore__controls">
      <library-sort-select
        :model-value="currentSort"
        :items="sortItems"
        :aria-label="$t('library.sortBy')"
        @update:model-value="setSort"
      />
      <div class="mobile-explore__actions">
        <v-btn-toggle
          v-if="canChooseLayout"
          :model-value="currentLayout"
          mandatory
          class="beacon-view-toggle"
          :aria-label="$t('library.layout')"
          @update:model-value="setLayout"
        >
          <v-btn value="grid" icon="mdi-view-grid-outline" :title="$t('library.layoutGrid')" />
          <v-btn value="list" icon="mdi-view-list" :title="$t('library.layoutList')" />
        </v-btn-toggle>
        <v-btn
          v-if="canPlay"
          icon="mdi-play-circle-outline"
          variant="text"
          :title="$t('explore.playAll')"
          :aria-label="$t('explore.playAll')"
          @click="playSection(false)"
        />
        <v-btn
          v-if="canPlay"
          icon="mdi-shuffle-variant"
          variant="text"
          :title="$t('explore.shuffleAll')"
          :aria-label="$t('explore.shuffleAll')"
          @click="playSection(true)"
        />
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="view-notice">
      {{ $t('explore.loadFailed') }}
      <v-btn variant="text" size="small" @click="loadSection">{{ $t('common.retry') }}</v-btn>
    </v-alert>

    <v-progress-circular
      v-if="loading && !entries.length"
      indeterminate
      color="primary"
      class="view-notice"
    />

    <div v-else-if="entries.length" :class="containerClass">
      <template v-for="entry in visibleEntries" :key="entryKey(entry)">
        <mobile-cover-tile
          v-if="currentLayout === 'grid' && entry.kind === 'playlists'"
          :title="entry.value.name"
          :subtitle="playlistMeta(entry.value)"
          :to="`/m/playlists/${entry.value.id}`"
          :cover-art-id="entry.value.coverArtId"
          fallback-icon="mdi-playlist-music"
        />
        <mobile-cover-tile
          v-else-if="currentLayout === 'grid' && entry.kind === 'albums'"
          :title="entry.value.name"
          :subtitle="albumMeta(entry.value)"
          :to="`/m/albums/${entry.value.id}`"
          :cover-art-id="entry.value.coverArtId"
        />
        <mobile-cover-tile
          v-else-if="currentLayout === 'grid' && entry.kind === 'artists'"
          :title="entry.value.name"
          :subtitle="artistMeta(entry.value)"
          :to="`/m/artists/${entry.value.id}`"
          :cover-art-id="entry.value.coverArtId"
          :image-url="entry.value.imageUrl"
          fallback-icon="mdi-account-music"
          round
        />
        <mobile-cover-tile
          v-else-if="currentLayout === 'grid' && entry.kind === 'songs'"
          :title="entry.value.title"
          :subtitle="entry.value.artist"
          :to="`/m/albums/${entry.value.albumId}`"
          :cover-art-id="entry.value.coverArtId"
          fallback-icon="mdi-music-note"
          playable
          @play="playSong(entry.value)"
        />
        <mobile-cover-tile
          v-else-if="currentLayout === 'grid' && entry.kind === 'genres'"
          :title="entry.value.name"
          :subtitle="genreMeta(entry.value)"
          :to="genreLink(entry.value.name)"
          :cover-art-id="genreCover(entry.value.name)"
          fallback-icon="mdi-tag-outline"
        />
        <mobile-cover-tile
          v-else-if="currentLayout === 'grid' && entry.kind === 'radio'"
          :title="entry.value.name"
          :to="'/m/radio'"
          :radio-favicon="radioFavicon(entry.value)"
          fallback-icon="mdi-radio"
          round
          playable
          @play="playRadio(entry.value)"
        />

        <mobile-playlist-row
          v-else-if="entry.kind === 'playlists'"
          :playlist="entry.value"
          :show-owner="true"
          @play="playPlaylist(entry.value)"
        />
        <mobile-album-row
          v-else-if="entry.kind === 'albums'"
          :album="entry.value"
          @play="playAlbum(entry.value)"
        />
        <mobile-artist-row v-else-if="entry.kind === 'artists'" :artist="entry.value" />
        <mobile-song-row
          v-else-if="entry.kind === 'songs'"
          :song="entry.value"
          @play="playSong(entry.value)"
          @open-actions="openActions(entry.value)"
        />
        <router-link
          v-else-if="entry.kind === 'genres'"
          :to="genreLink(entry.value.name)"
          class="mobile-explore__genre mobile-row"
        >
          <v-icon icon="mdi-tag-outline" class="mobile-explore__genre-icon" />
          <div class="mobile-row__text">
            <div class="text-body-medium">{{ entry.value.name }}</div>
            <div class="text-body-small text-medium-emphasis">{{ genreMeta(entry.value) }}</div>
          </div>
          <v-icon icon="mdi-chevron-right" />
        </router-link>
        <button
          v-else-if="entry.kind === 'radio'"
          type="button"
          class="mobile-explore__radio mobile-row"
          @click="playRadio(entry.value)"
        >
          <cover-art
            :radio-favicon="radioFavicon(entry.value)"
            :size="MOBILE_ROW_ART_SIZE"
            rounded
            fallback-icon="mdi-radio"
            class="mobile-row__art"
          />
          <div class="mobile-row__text">
            <div class="text-body-medium">{{ entry.value.name }}</div>
            <div v-if="radioHostname(entry.value)" class="text-body-small text-medium-emphasis">
              {{ radioHostname(entry.value) }}
            </div>
          </div>
          <v-icon icon="mdi-play-circle-outline" color="primary" />
        </button>
      </template>
    </div>

    <empty-state
      v-else-if="!loading"
      icon="mdi-magnify-close"
      :title="
        debouncedQuery
          ? $t('search.noResults', { query: debouncedQuery })
          : $t('explore.emptyTitle')
      "
      :text="debouncedQuery ? $t('search.noResultsHint') : $t('explore.emptyHint')"
    />

    <v-btn
      v-if="hasMore"
      variant="tonal"
      color="primary"
      rounded="pill"
      class="mobile-explore__more"
      @click="loadMore"
    >
      {{ $t('library.showMore') }}
    </v-btn>

    <mobile-song-action-sheet v-model="actionsOpen" :song="activeSong" />
    <radio-discover-dialog v-model="discoverOpen" compact />
  </v-container>
</template>

<script lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import EmptyState from '@/components/EmptyState.vue'
import LibrarySortSelect from '@/components/library/LibrarySortSelect.vue'
import RadioDiscoverDialog from '@/components/radio/RadioDiscoverDialog.vue'
import MobileAlbumRow from '@/components/mobile/MobileAlbumRow.vue'
import MobileArtistRow from '@/components/mobile/MobileArtistRow.vue'
import MobileCoverTile from '@/components/mobile/MobileCoverTile.vue'
import MobilePlaylistRow from '@/components/mobile/MobilePlaylistRow.vue'
import MobileSongActionSheet from '@/components/mobile/MobileSongActionSheet.vue'
import MobileSongRow from '@/components/mobile/MobileSongRow.vue'
import StickyFilter from '@/components/StickyFilter.vue'
import CoverArt from '@/components/library/CoverArt.vue'
import { MOBILE_ROW_ART_SIZE } from '@/components/mobile/rowMetrics'
import { accountScopedKey } from '@/services/accountKey'
import { coversByGenre } from '@/services/genreCovers'
import { sortPlaylists, type PlaylistSortKey } from '@/services/library/playlistBrowse'
import { matchesAllTerms } from '@/services/textSearch'
import { radioFaviconRequest, type RadioFaviconRequest } from '@/services/connect/radio'
import type { Album, Artist, Genre, Playlist, RadioStation, Song } from '@/types/library'

type Section = 'playlists' | 'albums' | 'artists' | 'songs' | 'genres' | 'radio'
type Layout = 'grid' | 'list'
type SortKey = 'recent' | 'newest' | 'name' | 'frequent' | 'shuffle'
type Entry =
  | { kind: 'playlists'; value: Playlist }
  | { kind: 'albums'; value: Album }
  | { kind: 'artists'; value: Artist }
  | { kind: 'songs'; value: Song }
  | { kind: 'genres'; value: Genre }
  | { kind: 'radio'; value: RadioStation }

interface SectionPreference {
  sort: SortKey
  layout: Layout
}

const PAGE_SIZE = 30
const PLAYLIST_LIMIT = 200
const PREFERENCES_KEY = 'beacon.mobileExplore.preferences'
const SECTIONS: Section[] = ['playlists', 'albums', 'artists', 'songs', 'genres', 'radio']
const SORTS: SortKey[] = ['recent', 'newest', 'name', 'frequent', 'shuffle']
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
let filterTimer: ReturnType<typeof setTimeout> | undefined

function defaultPreferences(): Record<Section, SectionPreference> {
  return {
    playlists: { sort: 'recent', layout: 'list' },
    albums: { sort: 'recent', layout: 'grid' },
    artists: { sort: 'recent', layout: 'grid' },
    songs: { sort: 'recent', layout: 'list' },
    genres: { sort: 'name', layout: 'grid' },
    radio: { sort: 'name', layout: 'list' },
  }
}

function loadPreferences(): Record<Section, SectionPreference> {
  const defaults = defaultPreferences()
  try {
    const saved = JSON.parse(
      localStorage.getItem(accountScopedKey(PREFERENCES_KEY)) ?? '{}',
    ) as Partial<Record<Section, SectionPreference>>
    for (const section of SECTIONS) {
      const value = saved[section]
      if (!value) continue
      if (SORTS.includes(value.sort)) defaults[section].sort = value.sort
      if (value.layout === 'grid' || value.layout === 'list')
        defaults[section].layout = value.layout
    }
  } catch {
    // A malformed or unavailable preference only costs the saved layout.
  }
  return defaults
}

function savePreferences(preferences: Record<Section, SectionPreference>): void {
  try {
    localStorage.setItem(accountScopedKey(PREFERENCES_KEY), JSON.stringify(preferences))
  } catch {
    // The choice still applies for this visit.
  }
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Stable for a visit, unlike Math.random() in a comparator: drawing again
 *  would reorder rows during an unrelated render. */
function shuffled<T extends { id?: string; name?: string }>(items: T[], seed: number): T[] {
  return [...items].sort((a, b) => hash(`${seed}:${identity(a)}`) - hash(`${seed}:${identity(b)}`))
}

function identity(item: { id?: string; name?: string }): string {
  return item.id ?? item.name ?? ''
}

function hash(value: string): number {
  let result = 2166136261
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function rankMap(items: Album[], key: (album: Album) => string): Map<string, number> {
  const ranks = new Map<string, number>()
  items.forEach((album, index) => {
    const id = key(album)
    if (!ranks.has(id)) ranks.set(id, index)
  })
  return ranks
}

export default {
  name: 'MobileExploreView',
  components: {
    EmptyState,
    LibrarySortSelect,
    RadioDiscoverDialog,
    MobileAlbumRow,
    MobileArtistRow,
    MobileCoverTile,
    MobilePlaylistRow,
    MobileSongActionSheet,
    MobileSongRow,
    StickyFilter,
    CoverArt,
  },
  data() {
    const requested = this.$route?.query?.section
    const supported = requested !== 'radio' || useAuthStore().capabilities.internetRadio
    return {
      MOBILE_ROW_ART_SIZE,
      section:
        supported && SECTIONS.includes(requested as Section)
          ? (requested as Section)
          : ('albums' as Section),
      preferences: loadPreferences(),
      searchOpen: false,
      query: '',
      debouncedQuery: '',
      visibleCount: PAGE_SIZE,
      loading: false,
      error: false,
      sectionRequest: 0,
      recentAlbums: [] as Album[],
      frequentAlbums: [] as Album[],
      newestAlbums: [] as Album[],
      rankingsRequested: false,
      shuffleSeed: 1,
      actionsOpen: false,
      activeSong: null as Song | null,
      discoverOpen: false,
    }
  },
  computed: {
    authStore() {
      return useAuthStore()
    },
    libraryStore() {
      return useLibraryStore()
    },
    playbackStore() {
      return usePlaybackStore()
    },
    sectionOptions(): { title: string; value: Section }[] {
      const options = [
        { title: this.$t('nav.playlists'), value: 'playlists' as Section },
        { title: this.$t('nav.albums'), value: 'albums' as Section },
        { title: this.$t('nav.artists'), value: 'artists' as Section },
        { title: this.$t('nav.songs'), value: 'songs' as Section },
        { title: this.$t('nav.genres'), value: 'genres' as Section },
      ]
      if (this.authStore.capabilities.internetRadio) {
        options.push({ title: this.$t('nav.radio'), value: 'radio' })
      }
      return options
    },
    currentPreference(): SectionPreference {
      return this.preferences[this.section]
    },
    currentSort(): SortKey {
      return this.currentPreference.sort
    },
    currentLayout(): Layout {
      return this.currentPreference.layout
    },
    sortItems(): { title: string; value: string }[] {
      if (this.section === 'genres' || this.section === 'radio') {
        return [{ title: this.$t('explore.sortAlphabetical'), value: 'name' }]
      }
      const values: SortKey[] =
        this.section === 'playlists' ? ['recent', 'name'] : ['recent', 'newest', 'name']
      if (this.section === 'albums' || this.section === 'artists' || this.section === 'songs') {
        values.push('frequent')
      }
      if (this.section !== 'playlists') values.push('shuffle')
      return values.map((value) => ({
        title: this.$t(`explore.sort${this.sortLabel(value)}`),
        value,
      }))
    },
    canChooseLayout(): boolean {
      return this.section !== 'genres' && this.section !== 'radio'
    },
    canPlay(): boolean {
      return this.section === 'albums' || this.section === 'songs'
    },
    containerClass(): string {
      return this.currentLayout === 'grid' ? 'mobile-explore__grid' : 'mobile-explore__list'
    },
    recentAlbumRank(): Map<string, number> {
      return rankMap(this.recentAlbums, (album) => album.id)
    },
    frequentAlbumRank(): Map<string, number> {
      return rankMap(this.frequentAlbums, (album) => album.id)
    },
    newestAlbumRank(): Map<string, number> {
      return rankMap(this.newestAlbums, (album) => album.id)
    },
    recentArtistRank(): Map<string, number> {
      return rankMap(this.recentAlbums, (album) => album.artistId)
    },
    frequentArtistRank(): Map<string, number> {
      return rankMap(this.frequentAlbums, (album) => album.artistId)
    },
    newestArtistRank(): Map<string, number> {
      return rankMap(this.newestAlbums, (album) => album.artistId)
    },
    genreCovers(): Map<string, string[]> {
      return coversByGenre(this.libraryStore.albums, 2)
    },
    entries(): Entry[] {
      const query = this.debouncedQuery.trim()
      const matches = (fields: (string | null | undefined)[]) =>
        !query || matchesAllTerms(query, fields, { exact: true })
      const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name)
      const rank = (map: Map<string, number>, id: string) => map.get(id) ?? Number.MAX_SAFE_INTEGER

      if (this.section === 'playlists') {
        const playlists = this.libraryStore.playlists.filter((playlist) => matches([playlist.name]))
        const playlistSort: Record<'recent' | 'newest' | 'name', PlaylistSortKey> = {
          recent: 'changed',
          newest: 'changed',
          name: 'name',
        }
        const sorted =
          this.currentSort === 'name'
            ? [...playlists].sort(byName)
            : sortPlaylists(playlists, {
                key: playlistSort[this.currentSort as 'recent' | 'newest'] ?? 'changed',
                direction: 'desc',
              })
        return sorted.map((value) => ({ kind: 'playlists', value }))
      }

      if (this.section === 'albums') {
        const albums = this.libraryStore.albums.filter((album) =>
          matches([album.name, album.artist]),
        )
        const sorted =
          this.currentSort === 'shuffle' ? shuffled(albums, this.shuffleSeed) : [...albums]
        if (this.currentSort !== 'shuffle') {
          sorted.sort((a, b) => {
            if (this.currentSort === 'name') return byName(a, b)
            if (this.currentSort === 'frequent') {
              return rank(this.frequentAlbumRank, a.id) - rank(this.frequentAlbumRank, b.id)
            }
            if (this.currentSort === 'newest') {
              return (
                timestamp(b.created) - timestamp(a.created) ||
                rank(this.newestAlbumRank, a.id) - rank(this.newestAlbumRank, b.id)
              )
            }
            return rank(this.recentAlbumRank, a.id) - rank(this.recentAlbumRank, b.id)
          })
        }
        return sorted.map((value) => ({ kind: 'albums', value }))
      }

      if (this.section === 'artists') {
        const artists = this.libraryStore.artists.filter((artist) => matches([artist.name]))
        const sorted =
          this.currentSort === 'shuffle' ? shuffled(artists, this.shuffleSeed) : [...artists]
        if (this.currentSort !== 'shuffle') {
          sorted.sort((a, b) => {
            if (this.currentSort === 'name') return byName(a, b)
            const map =
              this.currentSort === 'frequent'
                ? this.frequentArtistRank
                : this.currentSort === 'newest'
                  ? this.newestArtistRank
                  : this.recentArtistRank
            return rank(map, a.id) - rank(map, b.id)
          })
        }
        return sorted.map((value) => ({ kind: 'artists', value }))
      }

      if (this.section === 'songs') {
        const songs = this.libraryStore.allSongs.filter((song) =>
          matches([song.title, song.artist, song.album]),
        )
        const sorted =
          this.currentSort === 'shuffle' ? shuffled(songs, this.shuffleSeed) : [...songs]
        if (this.currentSort !== 'shuffle') {
          sorted.sort((a, b) => {
            if (this.currentSort === 'name') return collator.compare(a.title, b.title)
            if (this.currentSort === 'frequent') return b.playCount - a.playCount
            if (this.currentSort === 'newest') return timestamp(b.added) - timestamp(a.added)
            return timestamp(b.lastPlayed) - timestamp(a.lastPlayed)
          })
        }
        return sorted.map((value) => ({ kind: 'songs', value }))
      }

      if (this.section === 'genres') {
        return this.libraryStore.genres
          .filter((genre) => matches([genre.name]))
          .sort((a, b) =>
            this.currentSort === 'recent' ? b.songCount - a.songCount : byName(a, b),
          )
          .map((value) => ({ kind: 'genres', value }))
      }

      return this.libraryStore.radioStations
        .filter((station) => matches([station.name]))
        .sort(byName)
        .map((value) => ({ kind: 'radio', value }))
    },
    visibleEntries(): Entry[] {
      return this.entries.slice(0, this.visibleCount)
    },
    hasMore(): boolean {
      return this.entries.length > this.visibleCount
    },
  },
  watch: {
    section() {
      this.searchOpen = false
      this.query = ''
      this.debouncedQuery = ''
      this.visibleCount = PAGE_SIZE
      this.rememberSection()
      if (this.section === 'albums' || this.section === 'artists') void this.loadRankings()
      void this.loadSection()
    },
    query(value: string | null) {
      clearTimeout(filterTimer)
      filterTimer = setTimeout(() => {
        this.debouncedQuery = value ?? ''
        this.visibleCount = PAGE_SIZE
        this.rememberSection()
      }, 300)
    },
    currentSort() {
      this.visibleCount = PAGE_SIZE
      this.shuffleSeed++
      savePreferences(this.preferences)
    },
    currentLayout() {
      this.visibleCount = PAGE_SIZE
      savePreferences(this.preferences)
    },
    'authStore.capabilities.internetRadio'(supported: boolean) {
      if (!supported && this.section === 'radio') this.section = 'albums'
    },
    '$route.query.section'(value: unknown) {
      const supported = value !== 'radio' || this.authStore.capabilities.internetRadio
      if (supported && SECTIONS.includes(value as Section) && value !== this.section)
        this.section = value as Section
    },
    '$route.query.q'(value: unknown) {
      if (typeof value === 'string' && value !== this.query) {
        this.query = value
        this.debouncedQuery = value
      }
    },
  },
  created() {
    if (this.section === 'albums' || this.section === 'artists') void this.loadRankings()
    void this.loadSection()
    this.rememberSection()
  },
  beforeUnmount() {
    clearTimeout(filterTimer)
    this.sectionRequest++
  },
  methods: {
    sortLabel(value: SortKey): string {
      return value === 'recent'
        ? 'Recent'
        : value === 'newest'
          ? 'Newest'
          : value === 'name'
            ? 'Alphabetical'
            : value === 'frequent'
              ? 'MostPlayed'
              : 'Shuffle'
    },
    selectSection(section: Section) {
      if (section === this.section) return
      this.section = section
    },
    setSort(value: string) {
      if (!SORTS.includes(value as SortKey)) return
      this.currentPreference.sort = value as SortKey
    },
    setLayout(value: string) {
      if (value !== 'grid' && value !== 'list') return
      this.currentPreference.layout = value
    },
    toggleSearch() {
      this.searchOpen = !this.searchOpen
      if (!this.searchOpen) {
        this.query = ''
        this.debouncedQuery = ''
        this.rememberSection()
      }
    },
    rememberSection() {
      if (!this.$router || !this.$route) return
      const query: Record<string, string> = {}
      for (const [key, value] of Object.entries(this.$route.query)) {
        if (typeof value === 'string') query[key] = value
      }
      if (this.section === 'albums') delete query.section
      else query.section = this.section
      if (this.debouncedQuery) query.q = this.debouncedQuery
      else delete query.q
      if (query.section === this.$route.query.section && query.q === this.$route.query.q) return
      void this.$router.replace({ query })
    },
    async loadRankings() {
      if (this.rankingsRequested) return
      this.rankingsRequested = true
      const [recent, frequent, newest] = await Promise.allSettled([
        this.libraryStore.fetchRecentlyPlayedAlbums(100),
        this.libraryStore.fetchFrequentAlbums(100),
        this.libraryStore.client().getAlbumList2('newest', 100),
      ])
      if (recent.status === 'fulfilled') this.recentAlbums = recent.value
      if (frequent.status === 'fulfilled') this.frequentAlbums = frequent.value
      if (newest.status === 'fulfilled') this.newestAlbums = newest.value
      if (
        recent.status === 'rejected' &&
        frequent.status === 'rejected' &&
        newest.status === 'rejected'
      ) {
        this.rankingsRequested = false
      }
    },
    async loadSection() {
      const request = ++this.sectionRequest
      this.loading = true
      this.error = false
      const requests: Promise<unknown>[] =
        this.section === 'playlists'
          ? [this.libraryStore.fetchPlaylists()]
          : this.section === 'albums'
            ? [this.libraryStore.fetchAlbums()]
            : this.section === 'artists'
              ? [this.libraryStore.fetchArtists()]
              : this.section === 'songs'
                ? [this.libraryStore.fetchAllSongs()]
                : this.section === 'genres'
                  ? [this.libraryStore.fetchGenres(), this.libraryStore.fetchAlbums()]
                  : [this.libraryStore.fetchRadioStations()]
      const results = await Promise.allSettled(requests)
      if (request !== this.sectionRequest) return
      this.error = results.every((result) => result.status === 'rejected')
      this.loading = false
    },
    loadMore() {
      this.visibleCount += PAGE_SIZE
    },
    entryKey(entry: Entry): string {
      return `${entry.kind}:${'id' in entry.value ? entry.value.id : entry.value.name}`
    },
    playlistMeta(playlist: Playlist): string {
      return this.$t('playlists.songCount', { count: this.$n(playlist.songCount) })
    },
    albumMeta(album: Album): string {
      return [album.artist, album.year].filter(Boolean).join(' · ')
    },
    artistMeta(artist: Artist): string {
      return (
        this.$n(artist.albumCount) +
        ' ' +
        (artist.albumCount === 1 ? this.$t('library.album1') : this.$t('library.albumsN'))
      )
    },
    genreMeta(genre: Genre): string {
      return (
        this.$n(genre.albumCount) +
        ' ' +
        (genre.albumCount === 1 ? this.$t('library.album1') : this.$t('library.albumsN'))
      )
    },
    genreCover(name: string): string | null {
      return this.genreCovers.get(name.toLowerCase())?.[0] ?? null
    },
    genreLink(name: string): string {
      return `/m/genres/${encodeURIComponent(name)}`
    },
    radioFavicon(station: RadioStation): RadioFaviconRequest | null {
      if (!station.homePageUrl && !station.favicon) return null
      return radioFaviconRequest(station.homePageUrl ?? '', 48, station.favicon ?? '')
    },
    radioHostname(station: RadioStation): string {
      try {
        return new URL(station.homePageUrl || station.streamUrl).hostname.replace(/^www\./, '')
      } catch {
        return ''
      }
    },
    openActions(song: Song) {
      this.activeSong = song
      this.actionsOpen = true
    },
    async playSong(song: Song) {
      await this.playbackStore.playSongList([song], 0)
    },
    async playAlbum(album: Album) {
      const full = await this.libraryStore.fetchAlbum(album.id)
      await this.playbackStore.playSongList(full.songs, 0, false, true)
    },
    async playPlaylist(playlist: Playlist) {
      const full = await this.libraryStore.fetchPlaylist(playlist.id)
      await this.playbackStore.playSongList(full.songs, 0, false)
    },
    playRadio(station: RadioStation) {
      void this.playbackStore.playRadioStation(station)
    },
    async playSection(shuffle: boolean) {
      const albums = this.entries
        .filter((entry) => entry.kind === 'albums')
        .map((entry) => entry.value)
      let songs: Song[]
      if (albums.length) {
        const full = await Promise.all(
          albums.slice(0, PAGE_SIZE).map((album) => this.libraryStore.fetchAlbum(album.id)),
        )
        songs = full.flatMap((album) => album.songs).slice(0, PLAYLIST_LIMIT)
      } else {
        songs = this.entries
          .filter((entry) => entry.kind === 'songs')
          .map((entry) => entry.value)
          .slice(0, PLAYLIST_LIMIT)
      }
      if (!songs.length) return
      if (shuffle) songs = shuffled(songs, Date.now())
      await this.playbackStore.playSongList(songs, 0, false, songs.length > 1)
    },
  },
}
</script>

<style scoped>
.mobile-explore__sections {
  margin: 0 -16px 12px;
}

.mobile-explore__sections :deep(.v-slide-group__content) {
  gap: 6px;
  padding: 0 16px;
}

.mobile-explore__section.v-btn {
  flex-shrink: 0;
  min-width: 0;
  border: 1px solid var(--beacon-hairline);
  border-radius: 9999px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.8125rem;
  letter-spacing: normal;
  text-transform: none;
}

.mobile-explore__section--active.v-btn {
  border-color: rgba(var(--v-theme-primary), 0.45);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.mobile-explore__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.mobile-explore__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.mobile-explore__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 10px;
}

.mobile-explore__list {
  display: flex;
  flex-direction: column;
}

.mobile-explore__genre,
.mobile-explore__radio {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--beacon-hairline);
  border-radius: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.mobile-explore__genre:last-child,
.mobile-explore__radio:last-child {
  border-bottom: 0;
}

.mobile-explore__genre:hover,
.mobile-explore__radio:hover {
  background: var(--beacon-hover);
}

.mobile-explore__genre-icon {
  flex-shrink: 0;
  margin-right: 12px;
  color: rgb(var(--v-theme-primary));
}

.mobile-explore__more {
  display: flex;
  margin: 20px auto 0;
}
</style>
