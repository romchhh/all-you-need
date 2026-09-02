'use client';

import { ArrowLeft, Clock, Flame, MapPin, Search, SlidersHorizontal, Sparkles, TrendingUp, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TelegramWebApp } from '@/types/telegram';
import { Category, Listing } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { dismissMobileKeyboard } from '@/utils/dismissMobileKeyboard';
import { useDebounce } from '@/features/ui/hooks/useDebounce';
import {
  CATEGORY_POPULAR_QUERY_KEYS,
  POPULAR_SEARCH_QUERY_KEYS,
} from '@/constants/popularSearchQueries';
import { STICKY_BELOW_APP_HEADER_CLASS } from '@/components/layout/FixedLogoHeader';
import {
  addToSearchHistory,
  clearSearchHistory,
  getRecentSearchListings,
  getSearchHistory,
  listingToSearchPreview,
  updateSearchHistoryListings,
} from '@/utils/searchHistory';
import {
  loadBazaarTabStateFromStorage,
  persistBazaarTabState,
} from '@/lib/bazaar/bazaarTabStateStorage';
import type { Currency } from '@/utils/currency';
import { CategoryChip } from '@/components/listing/CategoryChip';
import { CategoryIcon } from '@/components/listing/CategoryIcon';
import { ListingCard } from '@/components/listing/ListingCard';
import { ListingCardColumn } from '@/components/listing/ListingCardColumn';
import { trackAnalytics } from '@/utils/analyticsClient';
import { ANALYTICS_EVENTS, ANALYTICS_EVENT_GROUPS } from '@/constants/analyticsEvents';
import { ListingCardSkeleton } from '@/components/ui/SkeletonLoader';

const SortModal = dynamic(
  () => import('@/components/modals/SortModal').then((m) => ({ default: m.SortModal })),
  { ssr: false }
);
const CityModal = dynamic(
  () => import('@/components/modals/CityModal').then((m) => ({ default: m.CityModal })),
  { ssr: false }
);

const SEARCH_DEBOUNCE_MS = 800;
const MIN_QUERY_LENGTH = 2;

type SearchScreenMode = 'discover' | 'results';
type SortOption = 'newest' | 'price_low' | 'price_high' | 'popular';

interface SearchViewProps {
  initialQuery: string;
  initialCategory?: string | null;
  categories: Category[];
  searchPlaceholder?: string;
  selectedCities?: string[];
  favorites: Set<number>;
  profileTelegramId?: string | null;
  onBack: () => void;
  onQueryChange?: (query: string) => void;
  onCategoryChange?: (category: string | null) => void;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
}

function SearchSection({
  title,
  icon,
  action,
  children,
  isLight,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  isLight: boolean;
}) {
  const ac = getAppearanceClasses(isLight);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}>{icon}</span>
          <h4 className={`truncate text-sm font-semibold ${ac.pageHeading}`}>{title}</h4>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CatalogListings({
  items,
  favorites,
  onSelect,
  onToggleFavorite,
  tg,
  viewMode,
  limit,
}: {
  items: Listing[];
  favorites: Set<number>;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
  viewMode: 'grid' | 'list';
  limit?: number;
}) {
  const slice = limit ? items.slice(0, limit) : items;

  if (viewMode === 'list') {
    return (
      <div className="space-y-3">
        {slice.map((listing) => (
          <ListingCardColumn
            key={listing.id}
            listing={listing}
            isFavorite={favorites.has(listing.id)}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
            tg={tg}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [grid-auto-rows:1fr]">
      {slice.map((listing) => (
        <div key={listing.id} data-listing-id={listing.id}>
          <ListingCard
            listing={listing}
            isFavorite={favorites.has(listing.id)}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
            tg={tg}
          />
        </div>
      ))}
    </div>
  );
}

function CatalogListingsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [grid-auto-rows:1fr]">
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function SearchView({
  initialQuery,
  initialCategory = null,
  categories,
  searchPlaceholder,
  selectedCities = [],
  favorites,
  profileTelegramId,
  onBack,
  onQueryChange,
  onCategoryChange,
  onSelectListing,
  onToggleFavorite,
  tg,
}: SearchViewProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);
  const lastFetchKeyRef = useRef('');
  const onQueryChangeRef = useRef(onQueryChange);
  const onCategoryChangeRef = useRef(onCategoryChange);

  onQueryChangeRef.current = onQueryChange;
  onCategoryChangeRef.current = onCategoryChange;

  const initialCommitted =
    (initialQuery?.trim().length ?? 0) >= MIN_QUERY_LENGTH;

  const [screenMode, setScreenMode] = useState<SearchScreenMode>(() =>
    initialCommitted ? 'results' : 'discover'
  );
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory);
  const [localCities, setLocalCities] = useState<string[]>(selectedCities);
  const citiesKey = localCities.join(',');
  const savedFilters = useMemo(() => loadBazaarTabStateFromStorage(), []);
  const [sortBy, setSortBy] = useState<SortOption>(savedFilters.sortBy ?? 'newest');
  const [showFreeOnly, setShowFreeOnly] = useState(savedFilters.showFreeOnly ?? false);
  const [minPrice, setMinPrice] = useState<number | null>(savedFilters.minPrice ?? null);
  const [maxPrice, setMaxPrice] = useState<number | null>(savedFilters.maxPrice ?? null);
  const [selectedCondition, setSelectedCondition] = useState<'new' | 'used' | null>(
    savedFilters.selectedCondition ?? null
  );
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(
    (savedFilters.selectedCurrency as Currency | null) ?? null
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [showSortModal, setShowSortModal] = useState(false);
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const debouncedQuery = useDebounce(localQuery, SEARCH_DEBOUNCE_MS);
  const [activeQuery, setActiveQuery] = useState(initialCommitted ? initialQuery.trim() : '');
  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loadingResults, setLoadingResults] = useState(false);
  const suppressAutoResultsRef = useRef(false);

  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [recentSearchListings, setRecentSearchListings] = useState<Listing[]>([]);
  const [popularListings, setPopularListings] = useState<Listing[]>([]);
  const [recentViewedListings, setRecentViewedListings] = useState<Listing[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [viewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bazaarViewMode') === 'list' ? 'list' : 'grid';
    }
    return 'grid';
  });

  const chipClass = isLight
    ? 'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 active:scale-[0.98]'
    : 'rounded-full border border-white px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 active:scale-[0.98]';

  const recentChipClass = isLight
    ? 'rounded-full border border-gray-300 bg-transparent px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 active:scale-[0.98]'
    : 'rounded-full border border-white bg-transparent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 active:scale-[0.98]';

  const refreshLocalHistory = useCallback(() => {
    setRecentQueries(getSearchHistory().slice(0, 8));
  }, []);

  const resetSearchState = useCallback(() => {
    searchRequestRef.current += 1;
    setActiveQuery('');
    setSearchResults([]);
    setSearchTotal(0);
    setLoadingResults(false);
    lastFetchKeyRef.current = '';
    suppressAutoResultsRef.current = false;
  }, []);

  const goToDiscoverHome = useCallback(() => {
    setScreenMode('discover');
    setLocalQuery('');
    resetSearchState();
    onQueryChangeRef.current?.('');
    dismissMobileKeyboard();
    tg?.HapticFeedback?.impactOccurred?.('light');
  }, [resetSearchState, tg]);

  const openMainSearchPage = useCallback(() => {
    if (screenMode !== 'results') return;
    suppressAutoResultsRef.current = true;
    setScreenMode('discover');
    setActiveQuery('');
    setSearchResults([]);
    setSearchTotal(0);
    setLoadingResults(false);
    lastFetchKeyRef.current = '';
    tg?.HapticFeedback?.impactOccurred?.('light');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [screenMode, tg]);

  const buildFetchKey = useCallback(
    (query: string, category: string | null) =>
      `${query.trim()}|${category ?? ''}|${citiesKey}|${sortBy}|${showFreeOnly}|${minPrice ?? ''}|${maxPrice ?? ''}|${selectedCondition ?? ''}|${selectedCurrency ?? ''}|${selectedSubcategory ?? ''}`,
    [citiesKey, sortBy, showFreeOnly, minPrice, maxPrice, selectedCondition, selectedCurrency, selectedSubcategory]
  );

  const fetchSearchResults = useCallback(
    async (
      query: string,
      options?: {
        haptic?: boolean;
        saveHistory?: boolean;
        force?: boolean;
        category?: string | null;
      }
    ) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) return;

      const category = options?.category !== undefined ? options.category : selectedCategory;
      const fetchKey = `commit|${buildFetchKey(trimmed, category)}`;
      if (!options?.force && fetchKey === lastFetchKeyRef.current) return;

      lastFetchKeyRef.current = fetchKey;
      const requestId = ++searchRequestRef.current;
      setLoadingResults(true);
      setActiveQuery(trimmed);

      if (options?.saveHistory !== false) {
        addToSearchHistory(trimmed);
        refreshLocalHistory();
      }
      if (options?.haptic) {
        tg?.HapticFeedback?.impactOccurred?.('light');
      }

      try {
        const params = new URLSearchParams({
          limit: '24',
          offset: '0',
          sortBy,
          search: trimmed,
        });
        if (citiesKey) {
          params.set('cities', citiesKey);
        }
        if (category) {
          params.set('category', category);
        }
        if (selectedSubcategory) {
          params.set('subcategory', selectedSubcategory);
        }
        if (showFreeOnly) {
          params.set('isFree', 'true');
        }
        if (minPrice != null) {
          params.set('minPrice', String(minPrice));
        }
        if (maxPrice != null) {
          params.set('maxPrice', String(maxPrice));
        }
        if (selectedCondition) {
          params.set('condition', selectedCondition);
        }
        if (selectedCurrency) {
          params.set('currency', selectedCurrency);
        }

        const res = await fetch(`/api/listings?${params.toString()}`, { cache: 'no-store' });
        if (requestId !== searchRequestRef.current) return;

        if (res.ok) {
          const data = await res.json();
          const list = (data.listings || []) as Listing[];
          setSearchResults(list);
          setSearchTotal(data.total ?? list.length);
          if (list.length > 0) {
            updateSearchHistoryListings(trimmed, list.slice(0, 6).map(listingToSearchPreview));
          }
        } else {
          setSearchResults([]);
          setSearchTotal(0);
        }
      } catch {
        if (requestId === searchRequestRef.current) {
          setSearchResults([]);
          setSearchTotal(0);
          lastFetchKeyRef.current = '';
        }
      } finally {
        if (requestId === searchRequestRef.current) {
          setLoadingResults(false);
        }
      }
    },
    [
      buildFetchKey,
      citiesKey,
      refreshLocalHistory,
      selectedCategory,
      selectedSubcategory,
      showFreeOnly,
      sortBy,
      minPrice,
      maxPrice,
      selectedCondition,
      selectedCurrency,
      tg,
    ]
  );

  const commitSearch = useCallback(
    (query: string, options?: { haptic?: boolean; saveHistory?: boolean; category?: string | null }) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) return;

      trackAnalytics({
        eventName: ANALYTICS_EVENTS.searchSubmit,
        eventGroup: ANALYTICS_EVENT_GROUPS.search,
        entityType: 'query',
        entityId: trimmed,
        metadata: { category: options?.category ?? selectedCategory },
      });

      setScreenMode('results');
      setLocalQuery(trimmed);
      onQueryChangeRef.current?.(trimmed);
      dismissMobileKeyboard();
      lastFetchKeyRef.current = '';
      void fetchSearchResults(trimmed, {
        haptic: options?.haptic ?? true,
        saveHistory: options?.saveHistory ?? true,
        force: true,
        category: options?.category,
      });
    },
    [fetchSearchResults]
  );

  const handleCategorySelect = useCallback(
    (categoryId: string | null) => {
      const next = selectedCategory === categoryId ? null : categoryId;
      if (next) {
        trackAnalytics({
          eventName: ANALYTICS_EVENTS.categoryClick,
          eventGroup: ANALYTICS_EVENT_GROUPS.navigation,
          entityType: 'category',
          entityId: next,
          metadata: { source: 'search' },
        });
      }
      setSelectedCategory(next);
      setSelectedSubcategory(null);
      onCategoryChangeRef.current?.(next);
      lastFetchKeyRef.current = '';
      tg?.HapticFeedback?.impactOccurred?.('light');

      const query = localQuery.trim();
      if (screenMode === 'results' && query.length >= MIN_QUERY_LENGTH) {
        lastFetchKeyRef.current = '';
        void fetchSearchResults(query, { force: true, category: next });
      }
    },
    [fetchSearchResults, localQuery, screenMode, selectedCategory, tg]
  );

  const handleClearQuery = useCallback(() => {
    goToDiscoverHome();
    inputRef.current?.focus();
  }, [goToDiscoverHome]);

  const pickQuery = useCallback(
    (query: string) => {
      commitSearch(query, { haptic: true, saveHistory: true });
    },
    [commitSearch]
  );

  const openListing = useCallback(
    (listing: Listing) => {
      tg?.HapticFeedback?.impactOccurred?.('light');
      onSelectListing(listing);
    },
    [tg, onSelectListing]
  );

  useEffect(() => {
    refreshLocalHistory();
  }, [refreshLocalHistory]);

  // Зовнішня зміна initialQuery (напр. навігація назад з ?q=)
  const prevInitialQueryRef = useRef(initialQuery);
  const prevInitialCategoryRef = useRef(initialCategory);
  useEffect(() => {
    if (prevInitialQueryRef.current === initialQuery && prevInitialCategoryRef.current === initialCategory) {
      return;
    }
    prevInitialQueryRef.current = initialQuery;
    prevInitialCategoryRef.current = initialCategory;
    setLocalQuery(initialQuery);
    setSelectedCategory(initialCategory);
    lastFetchKeyRef.current = '';
    if (initialQuery.trim().length >= MIN_QUERY_LENGTH) {
      setScreenMode('results');
      void fetchSearchResults(initialQuery, {
        saveHistory: false,
        force: true,
        category: initialCategory,
      });
    } else {
      resetSearchState();
      setScreenMode('discover');
    }
  }, [initialQuery, initialCategory, fetchSearchResults, resetSearchState]);

  // У режимі discover URL-query оновлюємо без автопошуку
  useEffect(() => {
    if (screenMode !== 'discover') return;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      onQueryChangeRef.current?.(trimmed);
      return;
    }
    if (trimmed.length === 0) {
      onQueryChangeRef.current?.('');
    }
  }, [debouncedQuery, screenMode]);

  // Під час набору на головній сторінці пошуку — одразу екран результатів (без проміжного discover)
  useEffect(() => {
    if (screenMode !== 'discover') return;
    if (suppressAutoResultsRef.current) return;

    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    setScreenMode('results');
    onQueryChangeRef.current?.(trimmed);
    lastFetchKeyRef.current = '';
    void fetchSearchResults(trimmed, { saveHistory: true, force: true });
  }, [debouncedQuery, screenMode, fetchSearchResults]);

  const activeQueryRef = useRef(activeQuery);
  activeQueryRef.current = activeQuery;

  // Зміна фільтрів у режимі результатів — перезавантажити
  useEffect(() => {
    if (screenMode !== 'results') return;
    const q = activeQueryRef.current.trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    lastFetchKeyRef.current = '';
    void fetchSearchResults(q, { saveHistory: false, force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- лише фільтри, не activeQuery
  }, [sortBy, showFreeOnly, citiesKey, screenMode, fetchSearchResults]);

  // Discover data
  useEffect(() => {
    let cancelled = false;
    setLoadingDiscover(true);

    const params = new URLSearchParams({ popularLimit: '6', recentLimit: '4' });
    if (profileTelegramId) params.set('telegramId', profileTelegramId);

    fetch(`/api/search/discover?${params}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPopularListings(Array.isArray(data.popularListings) ? data.popularListings : []);
        setRecentViewedListings(
          Array.isArray(data.recentViewedListings) ? data.recentViewedListings : []
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingDiscover(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileTelegramId]);

  useEffect(() => {
    const previews = getRecentSearchListings();
    if (previews.length === 0) {
      setRecentSearchListings([]);
      return;
    }

    let cancelled = false;
    const ids = previews.slice(0, 4).map((p) => p.id);

    Promise.all(
      ids.map(async (id) => {
        try {
          const params = profileTelegramId ? `?viewerId=${profileTelegramId}` : '';
          const res = await fetch(`/api/listings/${id}${params}`);
          if (res.ok) return (await res.json()) as Listing;
        } catch {
          /* skip */
        }
        return null;
      })
    ).then((rows) => {
      if (!cancelled) {
        setRecentSearchListings(rows.filter(Boolean) as Listing[]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profileTelegramId]);

  const inputClass = isLight
    ? 'w-full rounded-xl border border-[#3F5331]/15 bg-white py-3 pr-10 text-[#2D3E28] placeholder:text-[#5A6B52]/70 focus:border-[#3F5331]/35 focus:outline-none focus:ring-2 focus:ring-[#3F5331]/15'
    : 'w-full rounded-xl border border-white bg-transparent py-3 pr-10 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-[#C8E6A0]/30';

  const popularQueries = useMemo(() => {
    const categoryKeys =
      selectedCategory && CATEGORY_POPULAR_QUERY_KEYS[selectedCategory]
        ? CATEGORY_POPULAR_QUERY_KEYS[selectedCategory]
        : null;

    if (categoryKeys) {
      return categoryKeys.map((key) =>
        t(`bazaar.search.queriesByCategory.${selectedCategory}.${key}`)
      );
    }

    return POPULAR_SEARCH_QUERY_KEYS.map((key) => t(`bazaar.search.queries.${key}`));
  }, [selectedCategory, t]);

  const hasActiveFilters = Boolean(
    sortBy !== 'newest' ||
      showFreeOnly ||
      minPrice != null ||
      maxPrice != null ||
      selectedCondition != null ||
      selectedCurrency != null ||
      selectedSubcategory != null ||
      (screenMode === 'results' && selectedCategory)
  );

  const persistFilters = useCallback(
    (patch: Partial<{
      selectedCities: string[];
      sortBy: SortOption;
      showFreeOnly: boolean;
      minPrice: number | null;
      maxPrice: number | null;
      selectedCondition: 'new' | 'used' | null;
      selectedCurrency: Currency | null;
    }>) => {
      const current = loadBazaarTabStateFromStorage();
      persistBazaarTabState({
        ...current,
        selectedCities: patch.selectedCities ?? localCities,
        sortBy: patch.sortBy ?? sortBy,
        showFreeOnly: patch.showFreeOnly ?? showFreeOnly,
        minPrice: patch.minPrice !== undefined ? patch.minPrice : minPrice,
        maxPrice: patch.maxPrice !== undefined ? patch.maxPrice : maxPrice,
        selectedCondition:
          patch.selectedCondition !== undefined ? patch.selectedCondition : selectedCondition,
        selectedCurrency:
          patch.selectedCurrency !== undefined ? patch.selectedCurrency : selectedCurrency,
      });
    },
    [localCities, sortBy, showFreeOnly, minPrice, maxPrice, selectedCondition, selectedCurrency]
  );

  // Перезавантаження результатів при зміні фільтрів / міста (не на першому вході в results)
  const filtersReadyRef = useRef(false);
  useEffect(() => {
    if (screenMode !== 'results') {
      filtersReadyRef.current = false;
      return;
    }
    if (!filtersReadyRef.current) {
      filtersReadyRef.current = true;
      return;
    }
    const q = activeQuery.trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    lastFetchKeyRef.current = '';
    void fetchSearchResults(q, { force: true, saveHistory: false, haptic: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- лише фільтри/місто
  }, [
    citiesKey,
    sortBy,
    showFreeOnly,
    minPrice,
    maxPrice,
    selectedCondition,
    selectedCurrency,
    selectedSubcategory,
    screenMode,
  ]);

  const trimmedLocal = localQuery.trim();
  const isTypingPending =
    trimmedLocal.length >= MIN_QUERY_LENGTH && trimmedLocal !== debouncedQuery.trim();

  const stickySearchBg = isLight
    ? 'border-b border-[#3F5331]/10 bg-[#f5f7f2]/95 backdrop-blur-md'
    : 'border-b border-white/10 bg-[var(--tg-theme-bg-color,#111111)]/95 backdrop-blur-md';

  const catalogListingsProps = {
    favorites,
    onSelect: openListing,
    onToggleFavorite,
    tg,
    viewMode,
  };

  const resultsContent = (
    <div className="px-4 sm:px-6 pb-4 w-full max-w-[1680px] mx-auto space-y-4">
      <div className="min-w-0 pt-1">
        {!loadingResults && !isTypingPending && activeQuery && (
          <p className={`text-sm ${ac.mutedText}`}>
            {t('bazaar.search.resultsCount', { count: String(searchTotal) })}
          </p>
        )}
        {activeQuery && (loadingResults || (isTypingPending && trimmedLocal !== activeQuery)) && (
          <p className={`text-sm ${ac.mutedText}`}>{t('bazaar.search.searching')}</p>
        )}
      </div>

      {loadingResults || (isTypingPending && trimmedLocal !== activeQuery) ? (
        <CatalogListingsSkeleton count={6} />
      ) : searchResults.length > 0 ? (
        <CatalogListings items={searchResults} {...catalogListingsProps} />
      ) : activeQuery ? (
        <p className={`py-12 text-center text-sm ${ac.mutedText}`}>{t('common.nothingFound')}</p>
      ) : null}
    </div>
  );

  const discoverContent = (
    <div className="space-y-6 px-4 sm:px-6 pb-4 w-full max-w-[1680px] mx-auto">
      <SearchSection
        title={
          selectedCategory
            ? `${t('bazaar.search.popularQueries')}: ${
                categories.find((c) => c.id === selectedCategory)?.name ?? ''
              }`
            : t('bazaar.search.popularQueries')
        }
        icon={<Flame size={16} />}
        isLight={isLight}
      >
        <div className="flex flex-wrap gap-2">
          {popularQueries.map((query) => (
            <button key={query} type="button" onClick={() => pickQuery(query)} className={chipClass}>
              {query}
            </button>
          ))}
        </div>
      </SearchSection>

      {recentQueries.length > 0 && (
        <SearchSection
          title={t('bazaar.search.recentQueries')}
          icon={<Clock size={16} />}
          isLight={isLight}
          action={
            <button
              type="button"
              onClick={() => {
                clearSearchHistory();
                refreshLocalHistory();
                tg?.HapticFeedback?.impactOccurred?.('light');
              }}
              className={`shrink-0 text-xs font-medium ${
                isLight ? 'text-gray-500 hover:text-[#3F5331]' : 'text-white/55 hover:text-[#C8E6A0]'
              }`}
            >
              {t('bazaar.search.clearHistory')}
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {recentQueries.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => pickQuery(query)}
                className={`inline-flex items-center gap-1.5 ${recentChipClass}`}
              >
                <Clock size={12} className="opacity-60" />
                {query}
              </button>
            ))}
          </div>
        </SearchSection>
      )}

      {recentSearchListings.length > 0 && (
        <SearchSection
          title={t('bazaar.search.recentSearchListings')}
          icon={<Sparkles size={16} />}
          isLight={isLight}
        >
          <CatalogListings items={recentSearchListings} {...catalogListingsProps} />
        </SearchSection>
      )}

      {recentViewedListings.length > 0 && (
        <SearchSection
          title={t('bazaar.search.recentViewed')}
          icon={<TrendingUp size={16} />}
          isLight={isLight}
        >
          <CatalogListings items={recentViewedListings} limit={4} {...catalogListingsProps} />
        </SearchSection>
      )}

      <SearchSection
        title={t('bazaar.search.popularListings')}
        icon={<TrendingUp size={16} />}
        isLight={isLight}
      >
        {loadingDiscover && popularListings.length === 0 ? (
          <CatalogListingsSkeleton count={6} />
        ) : popularListings.length > 0 ? (
          <CatalogListings items={popularListings} limit={6} {...catalogListingsProps} />
        ) : (
          <p className={`text-sm ${ac.mutedText}`}>{t('common.nothingFound')}</p>
        )}
      </SearchSection>
    </div>
  );

  const backBtnClass = isLight
    ? 'border-[#3F5331]/20 bg-white/95 text-[#3F5331] shadow-sm hover:bg-[#E8F0E0]/80'
    : 'border-white/25 bg-black/45 text-white backdrop-blur-md hover:bg-black/60';

  const categoriesRow = (
    <div
      className="scrollbar-hide w-full max-w-full overflow-x-auto"
      style={{
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <div className="mx-auto flex w-max gap-2 px-4 pb-2 lg:px-0" style={{ minWidth: 'max-content' }}>
        <div
          className="flex min-w-[80px] max-w-[90px] flex-shrink-0 cursor-pointer flex-col items-center"
          onClick={() => handleCategorySelect(null)}
        >
          <div
            className={`relative mb-1.5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl transition-all ${
              !selectedCategory
                ? isLight
                  ? 'border-2 border-[#3F5331] bg-[#3F5331]/15 shadow-sm'
                  : 'border border-[#C8E6A0] bg-[#C8E6A0]/10 shadow-[0_0_12px_rgba(200,230,160,0.2)]'
                : isLight
                  ? 'border-2 border-[#3F5331] bg-white'
                  : 'border border-white/25 bg-[#1C1C1C]'
            }`}
          >
            <CategoryIcon categoryId="all_categories" isActive={!selectedCategory} size={32} />
          </div>
          <span
            className={`px-0.5 text-center text-xs font-medium leading-tight whitespace-normal ${
              !selectedCategory
                ? isLight
                  ? 'text-[#3F5331]'
                  : 'text-[#C8E6A0]'
                : ac.categoryRowLabel
            }`}
          >
            {t('bazaar.allCategories')}
          </span>
        </div>
        {categories.map((category) => (
          <CategoryChip
            key={category.id}
            category={category}
            isActive={selectedCategory === category.id}
            onClick={() => handleCategorySelect(category.id)}
          />
        ))}
        <div className="w-2 min-w-[0.5rem] flex-shrink-0" aria-hidden />
      </div>
    </div>
  );

  const searchField = (
    <div className="relative w-full">
      <Search
        className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 ${
          isLight ? 'text-gray-600' : 'text-white/80'
        }`}
        size={18}
        style={{ left: '14px' }}
      />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={searchPlaceholder || t('bazaar.whatInterestsYou')}
        value={localQuery}
        onChange={(e) => {
          suppressAutoResultsRef.current = false;
          const next = e.target.value;
          setLocalQuery(next);
          const trimmed = next.trim();
          if (trimmed.length >= MIN_QUERY_LENGTH && screenMode === 'discover') {
            setScreenMode('results');
            onQueryChangeRef.current?.(trimmed);
            setLoadingResults(true);
          }
        }}
        onFocus={() => {
          if (screenMode === 'results') {
            openMainSearchPage();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const q = localQuery.trim();
            if (q.length >= MIN_QUERY_LENGTH) {
              commitSearch(q, { haptic: true, saveHistory: true });
            }
          }
        }}
        className={inputClass}
        style={{ paddingLeft: '42px', fontSize: '16px' }}
      />
      {localQuery && (
        <button
          type="button"
          onClick={handleClearQuery}
          aria-label={t('common.clear')}
          className={`absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full ${
            isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-white/20 hover:bg-white/30'
          }`}
        >
          <X size={14} className={isLight ? 'text-gray-700' : 'text-white'} />
        </button>
      )}
    </div>
  );

  return (
    <>
      {screenMode === 'discover' ? (
        <>
          <div className="px-4 pt-0">
            <div className="flex justify-end pb-2">
              <button
                type="button"
                onClick={() => {
                  tg?.HapticFeedback?.impactOccurred?.('light');
                  onBack();
                }}
                aria-label={t('common.close')}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${backBtnClass}`}
              >
                <X size={20} />
              </button>
            </div>
            <h1 className={`min-w-0 text-lg font-bold leading-tight sm:text-xl ${ac.pageHeading}`}>
              {t('bazaar.search.pageTitle')}
            </h1>
          </div>

          {categoriesRow}

          <div className="mx-auto w-full max-w-xl space-y-2 px-4 pb-2 pt-2 xl:max-w-2xl lg:mx-auto">
            {searchField}
          </div>

          {discoverContent}
        </>
      ) : (
        <>
          <div className={`${STICKY_BELOW_APP_HEADER_CLASS} z-[42] ${stickySearchBg}`}>
            <div className="mx-auto flex w-full max-w-xl items-center gap-1.5 px-4 py-2 xl:max-w-2xl lg:mx-auto">
              <button
                type="button"
                onClick={() => {
                  tg?.HapticFeedback?.impactOccurred?.('light');
                  openMainSearchPage();
                }}
                aria-label={t('common.back')}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${backBtnClass}`}
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0 flex-1">{searchField}</div>
              <button
                type="button"
                onClick={() => {
                  setShowSortModal(true);
                  tg?.HapticFeedback?.impactOccurred?.('light');
                }}
                aria-label={t('common.filter')}
                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  hasActiveFilters
                    ? isLight
                      ? 'border-[#3F5331] bg-white'
                      : 'border-[#C8E6A0] bg-[#C8E6A0]/10'
                    : isLight
                      ? 'border-[#3F5331]/15 bg-white shadow-sm hover:bg-[#E8F0E0]/60'
                      : 'border-white bg-transparent hover:bg-white/10'
                }`}
              >
                <SlidersHorizontal
                  size={18}
                  className={
                    hasActiveFilters
                      ? isLight
                        ? 'text-[#3F5331]'
                        : 'text-[#C8E6A0]'
                      : isLight
                        ? 'text-gray-800'
                        : 'text-white'
                  }
                />
                {hasActiveFilters && (
                  <span
                    className={`pointer-events-none absolute top-1 right-1 z-20 h-2 w-2 rounded-full ring-2 ${
                      isLight
                        ? 'bg-[#3F5331] ring-gray-100'
                        : 'bg-[#C8E6A0] ring-black/50'
                    }`}
                    aria-hidden
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCityModalOpen(true);
                  tg?.HapticFeedback?.impactOccurred?.('light');
                }}
                aria-label={t('bazaar.selectCity') || t('common.city') || 'City'}
                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  localCities.length > 0
                    ? isLight
                      ? 'border-[#3F5331] bg-transparent'
                      : 'border-[#C8E6A0] bg-[#C8E6A0]/10'
                    : isLight
                      ? 'border-[#3F5331]/20 bg-[#E8F0E0]/70 hover:bg-[#E8F0E0]'
                      : 'border-white bg-transparent hover:bg-white/10'
                }`}
              >
                <MapPin
                  size={18}
                  className={
                    localCities.length > 0
                      ? isLight
                        ? 'text-[#3F5331]'
                        : 'text-[#C8E6A0]'
                      : isLight
                        ? 'text-[#5A6B52]'
                        : 'text-white'
                  }
                />
                {localCities.length > 0 && (
                  <span
                    className={`pointer-events-none absolute top-1 right-1 z-20 h-2 w-2 rounded-full ring-2 ${
                      isLight
                        ? 'bg-[#3F5331] ring-gray-100'
                        : 'bg-[#C8E6A0] ring-black/50'
                    }`}
                    aria-hidden
                  />
                )}
              </button>
            </div>
          </div>

          {resultsContent}
        </>
      )}

      <SortModal
        isOpen={showSortModal}
        currentSort={sortBy}
        showFreeOnly={showFreeOnly}
        minPrice={minPrice}
        maxPrice={maxPrice}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
        selectedCondition={selectedCondition}
        selectedCurrency={selectedCurrency}
        onClose={() => setShowSortModal(false)}
        onSelect={(sort) => {
          setSortBy(sort);
          persistFilters({ sortBy: sort });
        }}
        onToggleFreeOnly={(value) => {
          setShowFreeOnly(value);
          persistFilters({ showFreeOnly: value });
        }}
        onPriceRangeChange={(min, max) => {
          setMinPrice(min);
          setMaxPrice(max);
          persistFilters({ minPrice: min, maxPrice: max });
        }}
        onCategoryChange={(categoryId, subcategoryId) => {
          setSelectedCategory(categoryId);
          setSelectedSubcategory(subcategoryId);
          onCategoryChangeRef.current?.(categoryId);
        }}
        onConditionChange={(condition) => {
          setSelectedCondition(condition);
          persistFilters({ selectedCondition: condition });
        }}
        onCurrencyChange={(currency) => {
          setSelectedCurrency(currency);
          persistFilters({ selectedCurrency: currency });
        }}
        tg={tg}
      />

      <CityModal
        isOpen={isCityModalOpen}
        selectedCities={localCities}
        onClose={() => setIsCityModalOpen(false)}
        onSelect={(cities) => {
          setLocalCities(cities);
          persistFilters({ selectedCities: cities });
        }}
        tg={tg}
        profileTelegramId={profileTelegramId}
      />
    </>
  );
}