<template>
  <v-container fluid class="mobile-your-library">
    <div class="mobile-header">
      <h1 class="page-title mobile-header__title">{{ $t('mobile.tabYourLibrary') }}</h1>
      <v-btn
        :icon="searchOpen ? 'mdi-close' : 'mdi-magnify'"
        variant="text"
        :title="searchOpen ? $t('common.close') : $t('search.label')"
        :aria-label="searchOpen ? $t('common.close') : $t('search.label')"
        :aria-expanded="searchOpen"
        @click="toggleSearch"
      />
      <v-btn
        v-if="authStore.capabilities.emptyPlaylistCreation"
        icon="mdi-plus"
        color="primary"
        variant="tonal"
        :title="$t('playlists.createTitle')"
        :aria-label="$t('playlists.createTitle')"
        @click="openCreatePlaylist"
      />
    </div>

    <sticky-filter>
      <v-text-field
        v-if="searchOpen"
        ref="searchField"
        :model-value="filterQuery"
        :label="$t('search.label')"
        prepend-inner-icon="mdi-magnify"
        variant="solo-filled"
        density="compact"
        clearable
        hide-details
        class="your-library__search"
        @update:model-value="setQuery"
        @keyup.esc="closeSearch"
      />

      <div class="your-library__segments" role="group" :aria-label="$t('mobile.tabYourLibrary')">
        <button
          v-for="option in shownSegments"
          :key="option.value"
          type="button"
          class="your-library__segment"
          :class="{ 'your-library__segment--active': segment === option.value }"
          :aria-pressed="segment === option.value"
          @click="selectSegment(option.value)"
        >
          {{ option.title }}
        </button>
        <v-btn
          v-if="segment !== 'all'"
          icon="mdi-close"
          size="small"
          variant="text"
          :title="$t('common.close')"
          :aria-label="$t('common.close')"
          @click="selectSegment('all')"
        />
      </div>

      <div class="your-library__controls">
        <v-select
          :model-value="sort"
          :items="sortOptions"
          :aria-label="$t('library.sortBy')"
          prepend-inner-icon="mdi-sort"
          variant="solo-filled"
          density="compact"
          rounded="pill"
          flat
          hide-details
          class="your-library__sort"
          @update:model-value="setSort"
        />
        <v-btn-toggle
          v-model="layout"
          mandatory
          :aria-label="$t('library.layout')"
          class="beacon-view-toggle your-library__layout"
        >
          <v-btn
            value="grid"
            icon="mdi-view-grid-outline"
            :title="$t('library.layoutGrid')"
            :aria-label="$t('library.layoutGrid')"
          />
          <v-btn
            value="list"
            icon="mdi-format-list-bulleted"
            :title="$t('library.layoutList')"
            :aria-label="$t('library.layoutList')"
          />
        </v-btn-toggle>
      </div>
    </sticky-filter>

    <v-alert v-if="showError" type="error" variant="tonal" class="your-library__error">
      {{ $t('yourLibrary.loadFailed') }}
      <template #append>
        <v-btn variant="text" @click="loadData">{{ $t('common.retry') }}</v-btn>
      </template>
    </v-alert>

    <v-progress-circular
      v-if="showLoading"
      indeterminate
      color="primary"
      class="view-notice your-library__loading"
    />

    <div v-if="layout === 'grid'" class="your-library__grid">
      <mobile-cover-tile
        v-if="showFavorites"
        class="your-library__favorites"
        :title="$t('nav.favorites')"
        :subtitle="favoritesSubtitle"
        to="/m/library?favorites=1"
        fallback-icon="mdi-heart-outline"
      />
      <mobile-cover-tile
        v-for="entry in visibleEntries"
        :key="entry.key"
        :title="entryName(entry)"
        :subtitle="entrySubtitle(entry)"
        :to="entryRoute(entry)"
        :cover-art-id="entryCover(entry)"
        :image-url="entry.kind === 'artist' ? entry.item.imageUrl : null"
        :fallback-icon="entryFallback(entry)"
        :round="entry.kind === 'artist'"
      />
    </div>

    <div v-else class="your-library__list">
      <router-link
        v-if="showFavorites"
        to="/m/library?favorites=1"
        class="mobile-row your-library__favorites-row"
      >
        <cover-art
          :cover-art-id="null"
          :size="MOBILE_ROW_ART_SIZE"
          fallback-icon="mdi-heart-outline"
          class="mobile-row__art your-library__favorites-art"
        />
        <div class="mobile-row__text">
          <div class="text-body-medium">{{ $t('nav.favorites') }}</div>
          <div class="text-body-small text-medium-emphasis">{{ favoritesSubtitle }}</div>
        </div>
        <v-icon icon="mdi-chevron-right" class="text-medium-emphasis" />
      </router-link>
      <template v-for="entry in visibleEntries" :key="entry.key">
        <mobile-playlist-row
          v-if="entry.kind === 'playlist'"
          :playlist="entry.item"
          @play="playEntry(entry)"
        />
        <mobile-album-row
          v-else-if="entry.kind === 'album'"
          :album="entry.item"
          @play="playEntry(entry)"
        />
        <mobile-artist-row v-else :artist="entry.item" />
      </template>
    </div>

    <div v-if="hasMore" class="your-library__more">
      <v-btn variant="tonal" rounded="pill" @click="showMoreEntries">
        {{ $t('library.showMore') }}
      </v-btn>
    </div>

    <empty-state
      v-if="showEmpty"
      :icon="hasQuery ? 'mdi-magnify-close' : 'mdi-library-music-outline'"
      :title="emptyTitle"
      :text="emptyHint"
    />

    <create-playlist-dialog ref="createDialog" @created="onPlaylistCreated" />
  </v-container>
</template>

<script lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlaybackStore } from '@/stores/playback'
import { accountScopedKey } from '@/services/accountKey'
import { matchesAllTerms } from '@/services/textSearch'
import EmptyState from '@/components/EmptyState.vue'
import CoverArt from '@/components/library/CoverArt.vue'
import CreatePlaylistDialog from '@/components/library/CreatePlaylistDialog.vue'
import MobileAlbumRow from '@/components/mobile/MobileAlbumRow.vue'
import MobileArtistRow from '@/components/mobile/MobileArtistRow.vue'
import MobileCoverTile from '@/components/mobile/MobileCoverTile.vue'
import MobilePlaylistRow from '@/components/mobile/MobilePlaylistRow.vue'
import { MOBILE_ROW_ART_SIZE } from '@/components/mobile/rowMetrics'
import StickyFilter from '@/components/StickyFilter.vue'
import type { Album, Artist, Playlist } from '@/types/library'

type Segment = 'all' | 'playlists' | 'albums' | 'artists'
type Sort = 'recent' | 'newest' | 'alphabetical'
type Layout = 'grid' | 'list'
type LoadField = 'playlists' | 'starred' | 'albums' | 'artists' | 'recent'

type LibraryEntry =
  | { key: string; kind: 'playlist'; item: Playlist }
  | { key: string; kind: 'album'; item: Album }
  | { key: string; kind: 'artist'; item: Artist }

interface Preferences {
  sort: Sort
  layout: Layout
}

const PREFERENCES_KEY = 'beacon.mobileYourLibrary'
const PAGE_SIZE = 30
// getAlbumList2's server-side ceiling. Recents is a ranking input, not a
// collection shown here, so asking for the full page costs no extra renders.
const RECENT_ALBUMS_LIMIT = 500
const DEFAULT_PREFERENCES: Preferences = { sort: 'recent', layout: 'grid' }
const SORTS: Sort[] = ['recent', 'newest', 'alphabetical']
const LAYOUTS: Layout[] = ['grid', 'list']
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function loadPreferences(): Preferences {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(accountScopedKey(PREFERENCES_KEY)) ?? 'null',
    ) as Partial<Preferences> | null
    return {
      sort: parsed && SORTS.includes(parsed.sort as Sort) ? (parsed.sort as Sort) : 'recent',
      layout:
        parsed && LAYOUTS.includes(parsed.layout as Layout) ? (parsed.layout as Layout) : 'grid',
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nameKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase()
}

function compareNames(a: LibraryEntry, b: LibraryEntry): number {
  const first = a.item.name ?? ''
  const second = b.item.name ?? ''
  if (!first || !second) {
    if (first !== second) return first ? -1 : 1
  }
  return collator.compare(first, second)
}

/** Missing dates sort last in either direction; the name keeps ties stable. */
function compareDates(first: number | null, second: number | null, byName: number): number {
  if (first === null || second === null) {
    if (first !== second) return first === null ? 1 : -1
    return byName
  }
  return second - first || byName
}

export default {
  name: 'MobileYourLibraryView',
  components: {
    EmptyState,
    CoverArt,
    CreatePlaylistDialog,
    MobileAlbumRow,
    MobileArtistRow,
    MobileCoverTile,
    MobilePlaylistRow,
    StickyFilter,
  },
  data() {
    return {
      MOBILE_ROW_ART_SIZE,
      PAGE_SIZE,
      segment: 'all' as Segment,
      filterQuery: '',
      searchOpen: false,
      ...loadPreferences(),
      visibleCount: PAGE_SIZE,
      recentAlbums: [] as Album[],
      loaded: {
        playlists: false,
        starred: false,
        albums: false,
        artists: false,
        recent: false,
      } as Record<LoadField, boolean>,
      pending: {
        playlists: false,
        starred: false,
        albums: false,
        artists: false,
        recent: false,
      } as Record<LoadField, boolean>,
      failed: {
        playlists: false,
        starred: false,
        albums: false,
        artists: false,
        recent: false,
      } as Record<LoadField, boolean>,
      requestIds: {
        playlists: 0,
        starred: 0,
        albums: 0,
        artists: 0,
        recent: 0,
      } as Record<LoadField, number>,
      leaving: false,
    }
  },
  computed: {
    libraryStore() {
      return useLibraryStore()
    },
    authStore() {
      return useAuthStore()
    },
    canFavorites(): boolean {
      return this.authStore.capabilities.favorites
    },
    hasQuery(): boolean {
      return this.filterQuery.trim().length > 0
    },
    segmentOptions(): { title: string; value: Segment }[] {
      return [
        { title: this.$t('nav.playlists'), value: 'playlists' },
        { title: this.$t('nav.albums'), value: 'albums' },
        { title: this.$t('nav.artists'), value: 'artists' },
      ]
    },
    shownSegments(): { title: string; value: Segment }[] {
      if (this.segment === 'all') return this.segmentOptions
      return this.segmentOptions.filter((option) => option.value === this.segment)
    },
    sortOptions(): { title: string; value: Sort }[] {
      return [
        { title: this.$t('explore.sortRecent'), value: 'recent' },
        { title: this.$t('explore.sortNewest'), value: 'newest' },
        { title: this.$t('explore.sortAlphabetical'), value: 'alphabetical' },
      ]
    },
    showFavorites(): boolean {
      return this.canFavorites && this.segment !== 'playlists' && !this.hasQuery
    },
    favoritesSubtitle(): string {
      const count = this.libraryStore.starred.songs.length
      return this.$t('favorites.countSongs', { n: this.$n(count) }, count) as string
    },
    matchingEntries(): LibraryEntry[] {
      const query = this.filterQuery.trim()
      const entries: LibraryEntry[] = []
      if (this.segment === 'all' || this.segment === 'playlists') {
        for (const playlist of this.libraryStore.playlists) {
          if (matchesAllTerms(query, [playlist.name], { exact: true })) {
            entries.push({ key: `playlist:${playlist.id}`, kind: 'playlist', item: playlist })
          }
        }
      }
      if (this.canFavorites && (this.segment === 'all' || this.segment === 'albums')) {
        for (const album of this.libraryStore.starred.albums) {
          if (matchesAllTerms(query, [album.name, album.artist], { exact: true })) {
            entries.push({ key: `album:${album.id}`, kind: 'album', item: album })
          }
        }
      }
      if (this.canFavorites && (this.segment === 'all' || this.segment === 'artists')) {
        for (const artist of this.libraryStore.starred.artists) {
          if (matchesAllTerms(query, [artist.name], { exact: true })) {
            entries.push({ key: `artist:${artist.id}`, kind: 'artist', item: artist })
          }
        }
      }
      return entries
    },
    recentRanks(): {
      albums: Map<string, number>
      artists: Map<string, number>
      names: Map<string, number>
    } {
      const albums = new Map<string, number>()
      const artists = new Map<string, number>()
      const names = new Map<string, number>()
      this.recentAlbums.forEach((album, index) => {
        if (!albums.has(album.id)) albums.set(album.id, index)
        if (album.artistId && !artists.has(album.artistId)) artists.set(album.artistId, index)
        const name = nameKey(album.artist)
        if (name && !names.has(name)) names.set(name, index)
      })
      return { albums, artists, names }
    },
    newestAlbumByArtist(): { ids: Map<string, number>; names: Map<string, number> } {
      const ids = new Map<string, number>()
      const names = new Map<string, number>()
      for (const album of this.libraryStore.albums) {
        const created = timestamp(album.created)
        if (created === null) continue
        if (album.artistId) {
          const previous = ids.get(album.artistId)
          ids.set(album.artistId, previous === undefined ? created : Math.max(previous, created))
        }
        const name = nameKey(album.artist)
        if (name) {
          const previous = names.get(name)
          names.set(name, previous === undefined ? created : Math.max(previous, created))
        }
      }
      return { ids, names }
    },
    sortedEntries(): LibraryEntry[] {
      const ranks = this.recentRanks
      const newest = this.newestAlbumByArtist
      const recentRank = (entry: LibraryEntry): number => {
        if (entry.kind === 'album') return ranks.albums.get(entry.item.id) ?? Infinity
        if (entry.kind === 'artist') {
          return (
            ranks.artists.get(entry.item.id) ??
            ranks.names.get(nameKey(entry.item.name)) ??
            Infinity
          )
        }
        return Infinity
      }
      const changed = (entry: LibraryEntry): number | null => {
        if (entry.kind === 'playlist') return timestamp(entry.item.changed)
        if (entry.kind === 'album') return timestamp(entry.item.created)
        if (this.sort === 'recent') return null
        return newest.ids.get(entry.item.id) ?? newest.names.get(nameKey(entry.item.name)) ?? null
      }
      return [...this.matchingEntries].sort((first, second) => {
        const byName = compareNames(first, second)
        if (this.sort === 'alphabetical') return byName
        if (this.sort === 'recent') {
          const firstRecent = recentRank(first)
          const secondRecent = recentRank(second)
          if (firstRecent !== secondRecent) return firstRecent - secondRecent
        }
        return compareDates(changed(first), changed(second), byName)
      })
    },
    visibleEntries(): LibraryEntry[] {
      return this.sortedEntries.slice(0, this.visibleCount)
    },
    hasMore(): boolean {
      return this.sortedEntries.length > this.visibleEntries.length
    },
    neededFields(): LoadField[] {
      const fields: LoadField[] = []
      if (this.segment === 'all' || this.segment === 'playlists') fields.push('playlists')
      if (this.canFavorites && this.segment !== 'playlists') fields.push('starred')
      if (
        this.segment === 'all' ||
        this.segment === 'albums' ||
        (this.segment === 'artists' && this.sort === 'newest')
      ) {
        fields.push('albums')
      }
      if (this.segment === 'all' || this.segment === 'artists') fields.push('artists')
      if (
        this.sort === 'recent' &&
        this.segment !== 'playlists' &&
        this.authStore.capabilities.playHistoryStats
      ) {
        fields.push('recent')
      }
      return fields
    },
    showError(): boolean {
      // Recents only improves the ordering; its failure must not hide a
      // collection that loaded successfully.
      return this.neededFields.some((field) => field !== 'recent' && this.failed[field])
    },
    showLoading(): boolean {
      return (
        this.neededFields.some((field) => this.pending[field]) &&
        this.visibleEntries.length === 0 &&
        !this.showFavorites
      )
    },
    loadedCollection(): boolean {
      if (this.segment === 'playlists') return this.loaded.playlists
      if (this.segment === 'albums' || this.segment === 'artists') return this.loaded.starred
      return this.loaded.playlists || this.loaded.starred
    },
    showEmpty(): boolean {
      if (
        this.showLoading ||
        this.sortedEntries.length > 0 ||
        this.neededFields.some((field) => field !== 'recent' && this.pending[field])
      ) {
        return false
      }
      return !this.showError || this.loadedCollection
    },
    emptyTitle(): string {
      if (this.hasQuery) {
        return this.$t('search.noResults', { query: this.filterQuery }) as string
      }
      if (this.segment === 'playlists') return this.$t('playlists.noPlaylistsYet') as string
      if (this.segment === 'albums') return this.$t('favorites.noAlbumsYet') as string
      if (this.segment === 'artists') return this.$t('favorites.noArtistsYet') as string
      return this.$t('yourLibrary.emptyTitle') as string
    },
    emptyHint(): string | undefined {
      if (this.hasQuery) return this.$t('search.noResultsHint') as string
      if (this.segment === 'all') return this.$t('yourLibrary.emptyHint') as string
      if (this.segment === 'albums' || this.segment === 'artists') {
        return this.$t('favorites.emptyHint') as string
      }
      return undefined
    },
  },
  watch: {
    segment() {
      this.visibleCount = PAGE_SIZE
    },
    filterQuery() {
      if (this.leaving) return
      this.visibleCount = PAGE_SIZE
      this.rememberLocation()
    },
    sort(value: Sort) {
      this.visibleCount = PAGE_SIZE
      this.savePreferences()
      if (value === 'recent' && this.segment !== 'playlists') void this.loadRecent()
      if (value === 'newest' && this.segment === 'artists') {
        void this.loadField('albums', () => this.libraryStore.fetchAlbums())
      }
    },
    layout() {
      this.visibleCount = PAGE_SIZE
      this.savePreferences()
    },
    '$route.query.segment': 'applySegmentQuery',
    '$route.query.q': 'applySearchQuery',
  },
  created() {
    // The initial route is applied without triggering a second load; watchers
    // below handle later back/forward changes while this component is reused.
    this.applySegmentQuery(this.$route?.query?.segment, false)
    this.applySearchQuery(this.$route?.query?.q)
    void this.loadData()
  },
  beforeUnmount() {
    // There is no module-level search state to clean up: destruction drops the
    // field and query, while the address keeps q for the trip back. This flag
    // only stops late load responses from writing into the departing instance.
    this.leaving = true
  },
  methods: {
    entryName(entry: LibraryEntry): string {
      return entry.item.name ?? ''
    },
    entrySubtitle(entry: LibraryEntry): string {
      if (entry.kind === 'playlist') {
        return this.$t('playlists.songCount', {
          count: this.$n(entry.item.songCount),
        }) as string
      }
      if (entry.kind === 'album') return entry.item.artist ?? ''
      const count = this.$n(entry.item.albumCount)
      return `${count} ${this.$t(entry.item.albumCount === 1 ? 'library.album1' : 'library.albumsN')}`
    },
    entryRoute(entry: LibraryEntry): string {
      if (entry.kind === 'playlist') return `/m/playlists/${entry.item.id}`
      if (entry.kind === 'album') return `/m/albums/${entry.item.id}`
      return `/m/artists/${entry.item.id}`
    },
    entryCover(entry: LibraryEntry): string | null {
      return entry.item.coverArtId ?? null
    },
    entryFallback(entry: LibraryEntry): string {
      if (entry.kind === 'playlist') return 'mdi-playlist-music'
      if (entry.kind === 'album') return 'mdi-album'
      return 'mdi-account-music'
    },
    selectSegment(value: Segment) {
      const next = value === this.segment ? 'all' : value
      if (next === this.segment) return
      this.segment = next
      this.rememberLocation()
      void this.loadData()
    },
    setQuery(value: string | null) {
      // Deliberately synchronous: this is a local filter over lists already in
      // memory, so a debounce would only make the result lag the finger.
      this.filterQuery = value ?? ''
    },
    async toggleSearch() {
      if (this.searchOpen) {
        this.closeSearch()
        return
      }
      this.searchOpen = true
      await this.$nextTick()
      const field = this.$refs.searchField as { focus?: () => void } | undefined
      field?.focus?.()
    },
    closeSearch() {
      this.searchOpen = false
      this.filterQuery = ''
      this.rememberLocation()
    },
    setSort(value: Sort) {
      if (!SORTS.includes(value) || value === this.sort) return
      this.sort = value
    },
    setLayout(value: Layout) {
      if (!LAYOUTS.includes(value)) return
      this.layout = value
    },
    showMoreEntries() {
      this.visibleCount += PAGE_SIZE
    },
    savePreferences() {
      try {
        localStorage.setItem(
          accountScopedKey(PREFERENCES_KEY),
          JSON.stringify({ sort: this.sort, layout: this.layout } satisfies Preferences),
        )
      } catch {
        // The choice still applies for this visit when storage is unavailable.
      }
    },
    rememberLocation() {
      if (!this.$router || !this.$route) return
      const query: Record<string, string> = {}
      for (const [key, value] of Object.entries(this.$route.query)) {
        if (typeof value === 'string') query[key] = value
      }
      if (this.hasQuery) query.q = this.filterQuery
      else delete query.q
      if (this.segment === 'all') delete query.segment
      else query.segment = this.segment
      if (query.q === this.$route.query.q && query.segment === this.$route.query.segment) return
      // replace(), not push(): typing must not put one history stop per word
      // between the library and the page a result opens.
      void this.$router.replace({ query })
    },
    applySearchQuery(value: unknown) {
      this.filterQuery = typeof value === 'string' ? value : ''
      this.searchOpen = this.filterQuery.length > 0
    },
    applySegmentQuery(value: unknown, reload = true) {
      const next: Segment =
        value === 'playlists' || value === 'albums' || value === 'artists' ? value : 'all'
      if (next === this.segment) return
      this.segment = next
      if (reload) void this.loadData()
    },
    hasStoredData(field: LoadField): boolean {
      if (field === 'playlists') return this.libraryStore.playlists.length > 0
      if (field === 'starred') {
        return (
          this.libraryStore.starred.albums.length > 0 ||
          this.libraryStore.starred.artists.length > 0 ||
          this.libraryStore.starred.songs.length > 0
        )
      }
      if (field === 'albums') return this.libraryStore.albums.length > 0
      if (field === 'artists') return this.libraryStore.artists.length > 0
      return this.recentAlbums.length > 0
    },
    async loadField(field: LoadField, load: () => Promise<void>) {
      const requestId = ++this.requestIds[field]
      this.pending[field] = true
      this.failed[field] = false
      try {
        await load()
        if (this.requestIds[field] !== requestId || this.leaving) return
        this.loaded[field] = true
      } catch {
        if (this.requestIds[field] !== requestId || this.leaving) return
        this.failed[field] = true
        this.loaded[field] = this.hasStoredData(field)
      } finally {
        if (this.requestIds[field] === requestId) this.pending[field] = false
      }
    },
    async loadRecent() {
      if (!this.authStore.capabilities.playHistoryStats) {
        this.recentAlbums = []
        this.loaded.recent = true
        return
      }
      await this.loadField('recent', async () => {
        this.recentAlbums = await this.libraryStore.fetchRecentlyPlayedAlbums(RECENT_ALBUMS_LIMIT)
      })
    },
    async loadData() {
      const tasks: Promise<void>[] = []
      if (this.segment === 'all' || this.segment === 'playlists') {
        tasks.push(this.loadField('playlists', () => this.libraryStore.fetchPlaylists()))
      }
      if (this.canFavorites && this.segment !== 'playlists') {
        tasks.push(this.loadField('starred', () => this.libraryStore.fetchStarred()))
      }
      if (
        this.segment === 'all' ||
        this.segment === 'albums' ||
        (this.segment === 'artists' && this.sort === 'newest')
      ) {
        tasks.push(this.loadField('albums', () => this.libraryStore.fetchAlbums()))
      }
      if (this.segment === 'all' || this.segment === 'artists') {
        tasks.push(this.loadField('artists', () => this.libraryStore.fetchArtists()))
      }
      if (this.sort === 'recent' && this.segment !== 'playlists') tasks.push(this.loadRecent())
      await Promise.all(tasks)
    },
    openCreatePlaylist() {
      ;(this.$refs.createDialog as InstanceType<typeof CreatePlaylistDialog> | undefined)?.open([])
    },
    async onPlaylistCreated() {
      this.visibleCount = PAGE_SIZE
      await this.loadField('playlists', () => this.libraryStore.fetchPlaylists(true))
    },
    async playEntry(entry: LibraryEntry) {
      if (entry.kind === 'artist') return
      if (entry.kind === 'playlist') {
        const full = await this.libraryStore.fetchPlaylist(entry.item.id)
        await usePlaybackStore().playSongList(full.songs, 0, false)
        return
      }
      const full = await this.libraryStore.fetchAlbum(entry.item.id)
      await usePlaybackStore().playSongList(full.songs, 0, false, true)
    },
  },
}
</script>

<style scoped>
.your-library__search {
  margin-bottom: 12px;
}

/* Phone browsers zoom a focused input below 16px and do not reliably zoom
 * back out. The compact field keeps its smaller surrounding type. */
.your-library__search :deep(input) {
  font-size: 16px;
}

.your-library__segments {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.your-library__segment {
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid var(--beacon-hairline);
  border-radius: 9999px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: rgba(var(--v-theme-on-surface), 0.65);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.your-library__segment--active {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.your-library__segment:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.your-library__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.your-library__sort {
  flex: 1 1 150px;
  min-width: 0;
}

.your-library__layout {
  flex-shrink: 0;
}

.your-library__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px 8px;
}

/* Favorites has no sleeve to show. A quiet, token-colored heart keeps the
 * fixed entry from reading as a large amber promotional tile. */
.your-library__favorites.mobile-cover-tile :deep(.cover-art) {
  background: rgba(var(--v-theme-on-surface), 0.04);
  box-shadow: inset 0 0 0 1px var(--beacon-hairline);
}

.your-library__favorites.mobile-cover-tile :deep(.cover-art-fallback) {
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.your-library__favorites-art.cover-art {
  background: rgba(var(--v-theme-on-surface), 0.04);
  box-shadow: inset 0 0 0 1px var(--beacon-hairline);
}

.your-library__favorites-art :deep(.cover-art-fallback) {
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.your-library__favorites-row {
  text-decoration: none;
  color: inherit;
}

.your-library__list {
  display: flex;
  flex-direction: column;
}

.your-library__loading {
  display: flex;
  margin: 0 auto;
}

.your-library__error {
  margin-bottom: 16px;
}

.your-library__more {
  margin-top: 18px;
}

.your-library__more .v-btn {
  width: 100%;
}
</style>
