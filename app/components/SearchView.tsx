'use client';

import { ArrowLeft, Clock, Flame, Search, Sparkles, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TelegramWebApp } from '@/types/telegram';
import { Category, Listing } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useDebounce } from '@/hooks/useDebounce';
import { POPULAR_SEARCH_QUERY_KEYS } from '@/constants/popularSearchQueries';
import {
  addToSearchHistory,
  clearSearchHistory,
  getRecentSearchListings,
  getSearchHistory,
  listingToSearchPreview,
  updateSearchHistoryListings,
} from '@/utils/searchHistory';
import { STICKY_BELOW_APP_HEADER_CLASS } from './FixedLogoHeader';
import { CategoryChip } from './CategoryChip';
import { CategoryIcon } from './CategoryIcon';
import { ListingCard } from './ListingCard';
import { ListingCardColumn } from './ListingCardColumn';
import { ListingCardSkeleton } from './SkeletonLoader';

const SEARCH_DEBOUNCE_MS = 800;
const MIN_QUERY_LENGTH = 2;

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
  const citiesKey = selectedCities.join(',');

  onQueryChangeRef.current = onQueryChange;
  onCategoryChangeRef.current = onCategoryChange;

  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory);
  const debouncedQuery = useDebounce(localQuery, SEARCH_DEBOUNCE_MS);
  const [activeQuery, setActiveQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loadingResults, setLoadingResults] = useState(false);

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
  }, []);

  const buildFetchKey = useCallback(
    (query: string, category: string | null) =>
      `${query.trim()}|${category ?? ''}|${citiesKey}`,
    [citiesKey]
  );

  const fetchSearchResults = useCallback(
    async (
      query: string,
      options?: { haptic?: boolean; saveHistory?: boolean; force?: boolean; category?: string | null }
    ) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) return;

      const category = options?.category !== undefined ? options.category : selectedCategory;
      const fetchKey = buildFetchKey(trimmed, category);
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
          sortBy: 'newest',
          search: trimmed,
        });
        if (citiesKey) {
          params.set('cities', citiesKey);
        }
        if (category) {
          params.set('category', category);
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
    [buildFetchKey, citiesKey, refreshLocalHistory, selectedCategory, tg]
  );

  const handleCategorySelect = useCallback(
    (categoryId: string | null) => {
      const next = selectedCategory === categoryId ? null : categoryId;
      setSelectedCategory(next);
      onCategoryChangeRef.current?.(next);
      lastFetchKeyRef.current = '';
      tg?.HapticFeedback?.impactOccurred?.('light');

      const query = localQuery.trim();
      if (query.length >= MIN_QUERY_LENGTH) {
        void fetchSearchResults(query, { force: true, category: next });
      }
    },
    [fetchSearchResults, localQuery, selectedCategory, tg]
  );

  const handleClearQuery = useCallback(() => {
    setLocalQuery('');
    resetSearchState();
    onQueryChangeRef.current?.('');
    inputRef.current?.focus();
    tg?.HapticFeedback?.impactOccurred?.('light');
  }, [resetSearchState, tg]);

  const pickQuery = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      setLocalQuery(trimmed);
      onQueryChangeRef.current?.(trimmed);
      void fetchSearchResults(trimmed, { haptic: true, saveHistory: true, force: true });
    },
    [fetchSearchResults]
  );

  const openListing = useCallback(
    (listing: Listing) => {
      tg?.HapticFeedback?.impactOccurred?.('light');
      onSelectListing(listing);
    },
    [tg, onSelectListing]
  );

  // Фокус і історія — лише при монтуванні
  useEffect(() => {
    refreshLocalHistory();
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(focusTimer);
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
      void fetchSearchResults(initialQuery, {
        saveHistory: false,
        force: true,
        category: initialCategory,
      });
    } else {
      resetSearchState();
    }
  }, [initialQuery, initialCategory, fetchSearchResults, resetSearchState]);

  // Debounced live search
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    if (trimmed.length >= MIN_QUERY_LENGTH) {
      onQueryChangeRef.current?.(trimmed);
      void fetchSearchResults(trimmed, { haptic: false, saveHistory: true });
      return;
    }

    if (trimmed.length === 0) {
      resetSearchState();
      onQueryChangeRef.current?.('');
    }
  }, [debouncedQuery, fetchSearchResults, resetSearchState]);

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

  const suggestions = useMemo(() => {
    const q = localQuery.toLowerCase().trim();
    if (!q || q.length < MIN_QUERY_LENGTH) return [];
    const pool = [...searchResults, ...popularListings, ...recentViewedListings];
    const titles = new Set<string>();
    pool.forEach((listing) => {
      if (listing.title.toLowerCase().includes(q)) titles.add(listing.title);
    });
    return Array.from(titles).slice(0, 5);
  }, [localQuery, searchResults, popularListings, recentViewedListings]);

  const inputClass = isLight
    ? 'w-full rounded-xl border border-gray-300 bg-white py-3 pr-10 text-gray-900 placeholder:text-gray-500 focus:border-[#3F5331]/30 focus:outline-none focus:ring-2 focus:ring-[#3F5331]/20'
    : 'w-full rounded-xl border border-white bg-transparent py-3 pr-10 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-[#C8E6A0]/30';

  const popularQueries = POPULAR_SEARCH_QUERY_KEYS.map((key) =>
    t(`bazaar.search.queries.${key}`)
  );

  const trimmedLocal = localQuery.trim();
  const isTypingPending =
    trimmedLocal.length >= MIN_QUERY_LENGTH && trimmedLocal !== debouncedQuery.trim();
  const showResultsPanel =
    trimmedLocal.length >= MIN_QUERY_LENGTH || loadingResults || activeQuery.length >= MIN_QUERY_LENGTH;
  const showSuggestions =
    trimmedLocal.length >= MIN_QUERY_LENGTH && suggestions.length > 0 && isTypingPending;

  const catalogListingsProps = {
    favorites,
    onSelect: openListing,
    onToggleFavorite,
    tg,
    viewMode,
  };

  const resultsContent = (
    <div className="px-4 sm:px-6 pb-4 w-full max-w-[1680px] mx-auto space-y-4">
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${ac.pageHeading}`}>
          {activeQuery
            ? t('bazaar.search.resultsTitle', { query: activeQuery })
            : t('bazaar.search.searching')}
        </p>
        {!loadingResults && !isTypingPending && activeQuery && (
          <p className={`mt-0.5 text-xs ${ac.mutedText}`}>
            {t('bazaar.search.resultsCount', { count: String(searchTotal) })}
          </p>
        )}
      </div>

      {showSuggestions && (
        <div className={`overflow-hidden rounded-2xl border ${ac.suggestionDropdown}`}>
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion}-${index}`}
              type="button"
              onClick={() => pickQuery(suggestion)}
              className={ac.suggestionRow}
            >
              <Search size={16} className={ac.suggestionIcon} />
              <span className="truncate text-left">{suggestion}</span>
            </button>
          ))}
        </div>
      )}

      {loadingResults || isTypingPending ? (
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
        title={t('bazaar.search.popularQueries')}
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

  return (
    <>
      <div
        className={`${STICKY_BELOW_APP_HEADER_CLASS} z-20 border-b px-4 py-3 ${
          isLight
            ? 'border-gray-200 bg-white/90 backdrop-blur-md'
            : 'border-gray-700/50 bg-black/80 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 xl:max-w-2xl">
          <button
            type="button"
            onClick={() => {
              tg?.HapticFeedback?.impactOccurred?.('light');
              onBack();
            }}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              isLight ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-800/50 hover:bg-gray-700/50'
            }`}
          >
            <ArrowLeft size={20} className={isLight ? 'text-gray-900' : 'text-white'} />
          </button>
          <h1 className={`min-w-0 flex-1 truncate text-lg font-bold ${ac.pageHeading}`}>
            {t('common.search')}
          </h1>
          {trimmedLocal && (
            <button
              type="button"
              onClick={handleClearQuery}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                isLight
                  ? 'border-gray-300 text-gray-900 hover:bg-gray-100'
                  : 'border-white text-white hover:bg-white/10'
              }`}
            >
              {t('common.clear')}
            </button>
          )}
        </div>
      </div>

      <div className="w-full pb-1 pt-2">
        <div
          className="scrollbar-hide w-full max-w-full overflow-x-auto lg:px-6"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div
            className="mx-auto flex w-max gap-2 px-4 pb-2 lg:px-0"
            style={{ minWidth: 'max-content' }}
          >
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
      </div>

      <div className="mx-auto w-full max-w-xl px-4 pb-4 pt-1 xl:max-w-2xl lg:flex lg:justify-center">
        <div className="relative mb-0 w-full">
          <Search
            className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 ${
              isLight ? 'text-gray-600' : 'text-white/80'
            }`}
            size={18}
            style={{ left: '14px' }}
          />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={searchPlaceholder || t('bazaar.whatInterestsYou')}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const q = localQuery.trim();
                if (q.length >= MIN_QUERY_LENGTH) {
                  onQueryChangeRef.current?.(q);
                  void fetchSearchResults(q, { haptic: true, force: true });
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
              className={`absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full ${
                isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-white/20 hover:bg-white/30'
              }`}
            >
              <X size={14} className={isLight ? 'text-gray-700' : 'text-white'} />
            </button>
          )}
        </div>
      </div>

      {showResultsPanel ? resultsContent : discoverContent}
    </>
  );
}