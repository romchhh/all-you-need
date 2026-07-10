'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue, startTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Listing } from '@/types';
import { getCategories } from '@/constants/categories';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { useToast } from '@/features/ui/hooks/useToast';
import { getFavoritesFromStorage, addFavoriteToStorage, removeFavoriteFromStorage } from '@/utils/favorites';
import { getCachedData, setCachedData, invalidateCache } from '@/utils/cache';
import { useUser } from '@/features/user/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useActivityHeartbeat } from '@/features/user/hooks/useActivityHeartbeat';
import { usePullToRefresh } from '@/features/ui/hooks/usePullToRefresh';
import { useDebounce } from '@/features/ui/hooks/useDebounce';
import { logTelegramEnvironment } from '@/lib/telegram/telegramDebug';
import {
  loadBazaarTabStateFromStorage,
  persistBazaarTabState,
  type BazaarTabPersistedState,
} from '@/lib/bazaar/bazaarTabStateStorage';
import { listingToSearchPreview, updateSearchHistoryListings } from '@/utils/searchHistory';
import { prefetchListingsImages } from '@/lib/media/listingMediaCache';
import {
  consumePendingListingCategory,
  resolveListingCategoryFilter,
  toBazaarHomeCategoryFilter,
  type ListingCategoryFilter,
} from '@/lib/listings/categoryFilter';
import {
  persistBazaarReturnListingId,
  readBazaarReturnListingId,
  BAZAAR_RESTORE_LISTING_EVENT,
} from '@/lib/bazaar/bazaarScrollStorage';

export type BazaarSellerPreview = {
  telegramId: string;
  name: string;
  avatar: string;
  username?: string;
  phone?: string;
};

export function useBazaarPage() {

  const params = useParams();
  const router = useRouter();
  
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { profile, isBlocked } = useUser();

  const showBlockedScreen = isBlocked && !profile;

  // Підключаємо heartbeat для оновлення активності (без другого useUser)
  useActivityHeartbeat(profile?.telegramId);
  
  // Зберігаємо telegramId при першому завантаженні
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const telegramId = urlParams.get('telegramId');
      if (telegramId) {
        sessionStorage.setItem('telegramId', telegramId);
      }
    }
  }, []);
  
  // Отримуємо категорії з перекладами (мемо — інакше ефект deep-link зациклюється)
  const categories = useMemo(() => getCategories(t), [t]);
  
  // Синхронізуємо мову з URL
  useEffect(() => {
    if (lang === 'uk' || lang === 'ru') {
      setLanguage(lang);
    }
  }, [lang, setLanguage]);

  // Передаємо telegramId в LanguageContext для завантаження мови з БД
  useEffect(() => {
    if (profile?.telegramId && typeof window !== 'undefined') {
      (window as any).__userTelegramId = profile.telegramId;
    }
  }, [profile?.telegramId]);

  // Діагностика Telegram WebApp (тільки в development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Викликаємо через невелику затримку, щоб Telegram WebApp встиг ініціалізуватися
      setTimeout(() => {
        logTelegramEnvironment();
      }, 500);
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState(() => {
    // Завантажуємо збережений пошуковий запит з localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarSearchQuery');
      return saved || '';
    }
    return '';
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 800);
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [selectedCategoryFromModal, setSelectedCategoryFromModal] = useState<string | null>(null);
  const previousListingRef = useRef<Listing | null>(null); // Зберігаємо картку товару перед відкриттям профілю продавця
  const listingHistoryStack = useRef<Listing[]>([]); // Стек історії переглянутих товарів для навігації назад
  const prevSelectedSeller = useRef<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const lastViewedListingIdRef = useRef<number | null>(null); // Зберігаємо ID останнього переглянутого товару
  /** Оголошення в стрічці, з якого відкрили картку (не змінюється при переході на «схожі») */
  const catalogOriginListingIdRef = useRef<number | null>(null);
  const pendingMountScrollListingIdRef = useRef<number | null>(
    typeof window !== 'undefined' ? readBazaarReturnListingId() : null
  );
  const mountScrollRestoreDoneRef = useRef(false);
  const savedScrollPositionRef = useRef<number>(0);
  const scrollPositionKey = 'bazaarScrollPosition';
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCatalogScrollRestoreRef = useRef(false); // Перехід у категорію з картки — не скролити до старого товару
  const forceListingsReloadRef = useRef(false);
  const previousFilterKey = useRef<string | null>(null);
  const appliedDeepLinkCategoryRef = useRef<string | null>(null);
  const listingsCountRef = useRef(0);
  const listingsFetchAbortRef = useRef<AbortController | null>(null);
  const viewModeRef = useRef<'catalog' | 'listing'>('catalog'); // Явний режим перегляду
  
  // КРИТИЧНО: Вимикаємо автоматичне відновлення scroll браузером
  // Це обов'язково для мобільних WebView
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);
  
  // Зберігаємо пошуковий запит в localStorage (debounce — не блокуємо main thread при наборі)
  const debouncedSearchForStorage = useDebounce(searchQuery, 500);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bazaarSearchQuery', debouncedSearchForStorage);
    }
  }, [debouncedSearchForStorage]);

  // Синхронізуємо пошук після повернення зі сторінки /search
  useEffect(() => {
    const syncSearchFromStorage = () => {
      if (typeof window === 'undefined') return;
      const saved = localStorage.getItem('bazaarSearchQuery') ?? '';
      setSearchQuery(saved);
    };
    window.addEventListener('pageshow', syncSearchFromStorage);
    return () => window.removeEventListener('pageshow', syncSearchFromStorage);
  }, []);

  // Deep-link: ?create=1 відкриває форму створення оголошення (товари) одразу
  const createLinkHandledRef = useRef(false);
  useEffect(() => {
    if (createLinkHandledRef.current) return;
    if (!profile) return;
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const create = urlParams.get('create');
    if (create === '1') {
      setIsCreateListingModalOpen(true);
      createLinkHandledRef.current = true;
      // прибираємо параметр, щоб не відкривалося знову при навігації/рефреші стану
      urlParams.delete('create');
      const next = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [profile]);
  
  // Зберігаємо стан для вкладки bazaar
  const [bazaarTabState, setBazaarTabState] = useState<BazaarTabPersistedState>(() =>
    loadBazaarTabStateFromStorage()
  );
  
  // Зберігаємо позицію скролу каталогу під час перегляду (fallback, якщо картку не знайдено в DOM)
  useEffect(() => {
    if (selectedListing || selectedSeller) return;

    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      savedScrollPositionRef.current = scrollY;
      localStorage.setItem(scrollPositionKey, scrollY.toString());
    };

    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    return () => window.removeEventListener('scroll', throttledScroll);
  }, [selectedListing, selectedSeller]);

  // Зберігаємо стан в localStorage (категорія — лише в памʼяті сесії)
  useEffect(() => {
    const timer = setTimeout(() => persistBazaarTabState(bazaarTabState), 400);
    return () => clearTimeout(timer);
  }, [bazaarTabState]);

  const applyListingCategoryNavigation = useCallback((resolved: ListingCategoryFilter) => {
    const catalogFilter = toBazaarHomeCategoryFilter(resolved);
    const applyKey = `${catalogFilter.categoryId}|${catalogFilter.subcategoryId ?? ''}`;
    appliedDeepLinkCategoryRef.current = applyKey;

    skipCatalogScrollRestoreRef.current = true;
    lastViewedListingIdRef.current = null;
    listingHistoryStack.current = [];
    forceListingsReloadRef.current = true;

    if (typeof window !== 'undefined') {
      invalidateCache('bazaarListingsState');
      localStorage.removeItem('bazaarSearchQuery');
      const url = new URL(window.location.href);
      url.searchParams.delete('category');
      url.searchParams.delete('subcategory');
      url.searchParams.delete('listing');
      url.searchParams.delete('user');
      window.history.replaceState({}, '', url.toString());
      document.body.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    setSearchQuery('');
    listingsCountRef.current = 0;
    setListings([]);
    setHasMore(false);
    setListingsOffset(0);
    setInitialLoading(true);
    setSelectedListing(null);
    setSelectedSeller(null);

    setBazaarTabState((prev) => ({
      ...prev,
      selectedCategory: catalogFilter.categoryId,
      selectedSubcategory: catalogFilter.subcategoryId,
      showFreeOnly: false,
      minPrice: null,
      maxPrice: null,
      selectedCondition: null,
      selectedCurrency: null,
    }));
  }, []);

  const openListingCategoryFromProduct = useCallback(
    (rawCategory: string, _rawSubcategory: string | null) => {
      const resolved = resolveListingCategoryFilter(categories, rawCategory, _rawSubcategory);
      if (!resolved) return;
      applyListingCategoryNavigation(resolved);
    },
    [applyListingCategoryNavigation, categories]
  );

  useEffect(() => {
    if (selectedListing || selectedSeller) return;
    if (typeof window === 'undefined') return;

    const clearCategoryParamsFromUrl = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('category') && !url.searchParams.has('subcategory')) return;
      url.searchParams.delete('category');
      url.searchParams.delete('subcategory');
      window.history.replaceState({}, '', url.toString());
    };

    const pending = consumePendingListingCategory();
    if (pending) {
      const pendingKey = `${pending.categoryId}|${pending.subcategoryId ?? ''}`;
      if (appliedDeepLinkCategoryRef.current !== pendingKey) {
        applyListingCategoryNavigation(pending);
      }
      clearCategoryParamsFromUrl();
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (!categoryParam) return;
    const urlKey = `${categoryParam}|${urlParams.get('subcategory') ?? ''}`;
    if (appliedDeepLinkCategoryRef.current === urlKey) {
      clearCategoryParamsFromUrl();
      return;
    }
    const resolved = resolveListingCategoryFilter(
      categories,
      categoryParam,
      urlParams.get('subcategory')
    );
    if (resolved) {
      applyListingCategoryNavigation(resolved);
      clearCategoryParamsFromUrl();
    }
  }, [
    selectedListing,
    selectedSeller,
    categories,
    applyListingCategoryNavigation,
  ]);

  // Завантажуємо обране з localStorage при завантаженні
  useEffect(() => {
    const favorites = getFavoritesFromStorage();
    setFavorites(favorites);
  }, []);

  const PAGE_SIZE = 20;

  const [listings, setListings] = useState<Listing[]>(() => {
    if (typeof window === 'undefined') return [];
    const cached = getCachedData('bazaarListingsState');
    return cached?.listings?.length ? (cached.listings as Listing[]) : [];
  });
  const [initialLoading, setInitialLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    const cached = getCachedData('bazaarListingsState');
    return !(cached?.listings?.length);
  });
  const [isListingsRefreshing, setIsListingsRefreshing] = useState(false);
  const [listingsLoadError, setListingsLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(() => {
    if (typeof window === 'undefined') return false;
    const cached = getCachedData('bazaarListingsState');
    if (!cached?.listings?.length) return false;
    return (cached.listings.length ?? 0) < (cached.total ?? 0);
  });
  const [totalListings, setTotalListings] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const cached = getCachedData('bazaarListingsState');
    return cached?.total ?? 0;
  });
  const [listingsOffset, setListingsOffset] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const cached = getCachedData('bazaarListingsState');
    return cached?.offset ?? (cached?.listings?.length ? cached.listings.length : 0);
  });
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const feedCursorRef = useRef<string | null>(null);
  const { tg } = useTelegram();

  useEffect(() => {
    listingsCountRef.current = listings.length;
  }, [listings]);

  // Якщо відкрито з браузера (поза Telegram Mini App) з параметром ?listing=,
  // одразу перенаправляємо на SEO-сторінку товару /[lang]/listing/[id]
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Усередині Telegram залишаємо поточну поведінку
    if (tg) return;

    const urlParams = new URLSearchParams(window.location.search);
    const listingParam = urlParams.get('listing');
    if (listingParam) {
      const listingId = parseInt(listingParam, 10);
      if (!Number.isNaN(listingId)) {
        router.replace(`/${lang}/listing/${listingId}`);
      }
    }
  }, [tg, lang, router]);

  const buildListingsUrl = useCallback(
    (
      limit: number,
      offset: number,
      searchQueryForApi?: string,
      stateOverride?: BazaarTabPersistedState,
      cursor?: string | null
    ) => {
      const state = stateOverride ?? bazaarTabState;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('sortBy', state.sortBy || 'newest');
      const useCursor =
        (state.sortBy || 'newest') === 'newest' &&
        !(searchQueryForApi ?? debouncedSearchQuery ?? '').trim();
      if (useCursor && cursor) {
        params.set('cursor', cursor);
      } else {
        params.set('offset', String(offset));
      }
      if (state.selectedCategory) params.set('category', state.selectedCategory);
      if (state.selectedSubcategory) params.set('subcategory', state.selectedSubcategory);
      if (state.showFreeOnly) params.set('isFree', 'true');
      if (state.selectedCities?.length > 0) {
        params.set('cities', state.selectedCities.join(','));
      }
      if (state.minPrice != null) params.set('minPrice', String(state.minPrice));
      if (state.maxPrice != null) params.set('maxPrice', String(state.maxPrice));
      if (state.selectedCondition) params.set('condition', state.selectedCondition);
      if (state.selectedCurrency) params.set('currency', state.selectedCurrency);
      const searchTrimmed = (searchQueryForApi ?? debouncedSearchQuery ?? '').trim();
      if (searchTrimmed) {
        params.set('search', searchTrimmed);
      }
      return `/api/listings/feed?${params.toString()}`;
    },
    [
      bazaarTabState,
      debouncedSearchQuery,
    ]
  );
  const { toast, showToast, hideToast } = useToast();
  
  const saveCatalogScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const currentScroll = window.scrollY || document.documentElement.scrollTop;
    savedScrollPositionRef.current = currentScroll;
    localStorage.setItem(scrollPositionKey, currentScroll.toString());
  }, []);

  const restoreSavedScrollPosition = useCallback(() => {
    const savedPosition =
      savedScrollPositionRef.current > 0
        ? savedScrollPositionRef.current
        : parseInt(localStorage.getItem(scrollPositionKey) || '0', 10);
    if (savedPosition > 0) {
      window.scrollTo({ top: savedPosition, behavior: 'auto' });
      document.documentElement.scrollTop = savedPosition;
      document.body.scrollTop = savedPosition;
    }
  }, []);

  const scrollToListing = useCallback(
    (listingId: number) => {
      if (typeof window === 'undefined' || viewModeRef.current !== 'catalog') return;

      const scrollToElement = (attempt = 0) => {
        if (viewModeRef.current !== 'catalog') return;

        const element = document.querySelector(
          `[data-listing-id="${listingId}"]`
        ) as HTMLElement | null;

        if (element) {
          element.scrollIntoView({
            behavior: 'auto',
            block: 'center',
            inline: 'nearest',
          });
          return;
        }

        if (attempt < 20) {
          setTimeout(() => scrollToElement(attempt + 1), 150);
          return;
        }

        restoreSavedScrollPosition();
      };

      setTimeout(() => scrollToElement(), 100);
    },
    [restoreSavedScrollPosition]
  );

  const restoreCatalogListingScroll = useCallback(() => {
    const targetId =
      catalogOriginListingIdRef.current ?? readBazaarReturnListingId();
    if (targetId == null) {
      restoreSavedScrollPosition();
      return;
    }
    catalogOriginListingIdRef.current = targetId;
    scrollToListing(targetId);
  }, [scrollToListing, restoreSavedScrollPosition]);

  useEffect(() => {
    const onRestore = () => {
      if (selectedListing || selectedSeller) return;
      restoreCatalogListingScroll();
    };
    window.addEventListener(BAZAAR_RESTORE_LISTING_EVENT, onRestore);
    return () => window.removeEventListener(BAZAAR_RESTORE_LISTING_EVENT, onRestore);
  }, [selectedListing, selectedSeller, restoreCatalogListingScroll]);

  // Обробка параметрів з URL (для поділених товарів/профілів)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const listingParam = urlParams.get('listing');
    const userParam = urlParams.get('user');
    
    if (listingParam) {
      const listingId = parseInt(listingParam);
      if (!isNaN(listingId) && (!selectedListing || selectedListing.id !== listingId)) {
        fetch(`/api/listings/${listingId}`)
          .then(res => res.json())
          .then(data => {
            if (data.id) {
              lastViewedListingIdRef.current = data.id;
              // Скролимо нагору перед відкриттям
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              setSelectedListing(data);
            }
          })
          .catch(err => console.error('Error fetching listing:', err));
      }
    } else if (userParam) {
      const telegramId = userParam;
      if (!selectedSeller || selectedSeller.telegramId !== telegramId) {
        fetch(`/api/user/profile?telegramId=${telegramId}`)
          .then(res => res.json())
          .then(data => {
            if (data.telegramId) {
              setSelectedSeller({
                telegramId: data.telegramId.toString(),
                name: data.firstName && data.lastName 
                  ? `${data.firstName} ${data.lastName}`.trim()
                  : data.username || 'Користувач',
                avatar: data.avatar || '👤',
                username: data.username || undefined,
                phone: data.phone || undefined
              });
            }
          })
          .catch(err => console.error('Error fetching user profile:', err));
      }
    }
  }, []);

  const hasActiveFiltersForState = useCallback(
    (state: BazaarTabPersistedState) =>
      Boolean(
        state.selectedCategory ||
          state.selectedSubcategory ||
          state.showFreeOnly ||
          (state.selectedCities?.length ?? 0) > 0 ||
          state.minPrice != null ||
          state.maxPrice != null ||
          state.selectedCondition ||
          state.selectedCurrency
      ),
    []
  );

  const hasActiveFilters = hasActiveFiltersForState(bazaarTabState);
  const hasSearchQuery = Boolean((debouncedSearchQuery ?? '').trim());

  const hasLoadedListings = useRef(
    typeof window !== 'undefined' && Boolean(getCachedData('bazaarListingsState')?.listings?.length)
  );

  const schedulePrefetchListingsImages = useCallback((items: Listing[]) => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const run = () => prefetchListingsImages(items, 4);
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 300);
    }
  }, []);

  // Функція завантаження оголошень (з фільтрами та пошуком)
  const fetchListings = useCallback(async (
    forceRefresh: boolean = false,
    initialSearch?: string,
    stateOverride?: BazaarTabPersistedState
  ) => {
    const requestState = stateOverride ?? bazaarTabState;
    const requestHasActiveFilters = hasActiveFiltersForState(requestState);
    const hasExistingListings = listingsCountRef.current > 0;
    if (hasExistingListings) {
      setIsListingsRefreshing(true);
    } else {
      setInitialLoading(true);
    }

    listingsFetchAbortRef.current?.abort();
    const controller = new AbortController();
    listingsFetchAbortRef.current = controller;

    try {
      const searchForRequest = (initialSearch ?? debouncedSearchQuery ?? '').trim();
      const useSearch = Boolean(searchForRequest);

      // Кеш тільки без фільтрів, без пошуку і без примусового оновлення
      if (!forceRefresh && !requestHasActiveFilters && !useSearch && typeof window !== 'undefined') {
        const cached = getCachedData('bazaarListingsState');
        if (cached?.listings?.length) {
          const cacheAge = Date.now() - (cached.timestamp || 0);
          if (cacheAge < 5 * 60 * 1000) {
            startTransition(() => {
              setListings(cached.listings || []);
              setTotalListings(cached.total || 0);
              setHasMore((cached.listings?.length ?? 0) < (cached.total ?? 0));
              setListingsOffset(cached.offset ?? PAGE_SIZE);
            });
            setInitialLoading(false);
            setIsListingsRefreshing(false);
            schedulePrefetchListingsImages(cached.listings || []);
            return;
          }
        }
      }

      const response = await fetch(
        buildListingsUrl(PAGE_SIZE, 0, searchForRequest || undefined, requestState),
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (response.ok) {
        setListingsLoadError(false);
        const data = await response.json();
        const list = data.listings || [];
        const total = data.total ?? 0;
        const more = Boolean(data.hasMore ?? list.length < total);
        const nextCur = (data.nextCursor as string | null) || null;
        startTransition(() => {
          setListings(list);
          setTotalListings(total);
          setHasMore(more);
          setListingsOffset(list.length);
          setFeedCursor(nextCur);
          feedCursorRef.current = nextCur;
        });
        schedulePrefetchListingsImages(list);

        if (useSearch && searchForRequest?.trim() && list.length > 0) {
          updateSearchHistoryListings(
            searchForRequest.trim(),
            list.slice(0, 6).map(listingToSearchPreview)
          );
        }

        if (!requestHasActiveFilters && !useSearch && typeof window !== 'undefined') {
          setCachedData('bazaarListingsState', {
            listings: list,
            total,
            hasMore: more,
            offset: list.length,
            timestamp: Date.now()
          });
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch listings:', response.status);
        }
        setListings([]);
        setTotalListings(0);
        setHasMore(false);
        setListingsOffset(0);
        setListingsLoadError(true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching listings:', error);
      }
      setListings([]);
      setTotalListings(0);
      setHasMore(false);
      setListingsOffset(0);
      setListingsLoadError(true);
    } finally {
      if (listingsFetchAbortRef.current === controller) {
        setInitialLoading(false);
        setIsListingsRefreshing(false);
      }
    }
  }, [showToast, t, buildListingsUrl, hasActiveFiltersForState, bazaarTabState, debouncedSearchQuery, PAGE_SIZE, schedulePrefetchListingsImages]);

  // Ключ фільтрів (категорія, міста, ціна, пошук тощо) — однаковий формат для першого завантаження та рефетчу
  const filterKey = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${(bazaarTabState.selectedCities ?? []).join(',')}|${bazaarTabState.minPrice ?? ''}|${bazaarTabState.maxPrice ?? ''}|${bazaarTabState.selectedCondition ?? ''}|${bazaarTabState.selectedCurrency ?? ''}|${(debouncedSearchQuery ?? '').trim()}`;

  // Перше завантаження (без фільтрів і без пошуку — можна з кешу; якщо є пошук — одразу з пошуком)
  useEffect(() => {
    if (listings.length > 0 && hasLoadedListings.current) return;

    const searchTrimmed = (searchQuery || '').trim();
    const cached = getCachedData('bazaarListingsState');
    if (cached && cached.listings && cached.listings.length > 0 && !hasActiveFilters && !searchTrimmed) {
      setListings(cached.listings || []);
      setTotalListings(cached.total || 0);
      setHasMore((cached.listings?.length ?? 0) < (cached.total ?? 0));
      setListingsOffset(cached.offset ?? PAGE_SIZE);
      setInitialLoading(false);
      hasLoadedListings.current = true;
      previousFilterKey.current = filterKey;
      schedulePrefetchListingsImages(cached.listings || []);
      return;
    }

    if (!hasLoadedListings.current) {
      hasLoadedListings.current = true;
      // Ключ з поточним пошуком (щоб після debounce не робити зайвий рефетч)
      previousFilterKey.current = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${searchTrimmed}`;
      // Якщо в полі пошуку вже є текст (наприклад з localStorage) — одразу завантажуємо з пошуком
      fetchListings(false, searchTrimmed || undefined);
    }
  }, [fetchListings, hasActiveFilters, hasSearchQuery, bazaarTabState.selectedCategory, bazaarTabState.selectedSubcategory, bazaarTabState.sortBy, bazaarTabState.showFreeOnly, debouncedSearchQuery, filterKey, searchQuery, schedulePrefetchListingsImages]);

  // Після перезавантаження / лого — повернутися до товару в стрічці
  useEffect(() => {
    if (mountScrollRestoreDoneRef.current) return;
    if (selectedListing || selectedSeller) return;
    if (listings.length === 0) return;
    const targetId =
      pendingMountScrollListingIdRef.current ?? catalogOriginListingIdRef.current;
    if (targetId == null) return;
    mountScrollRestoreDoneRef.current = true;
    pendingMountScrollListingIdRef.current = null;
    catalogOriginListingIdRef.current = targetId;
    scrollTimeoutRef.current = setTimeout(() => {
      scrollToListing(targetId);
      scrollTimeoutRef.current = null;
    }, 200);
  }, [listings.length, selectedListing, selectedSeller, scrollToListing]);

  // При зміні фільтрів (включно з ціною/станом/валютою) або пошуку — перезавантажити з offset 0
  useEffect(() => {
    const key = filterKey;
    if (forceListingsReloadRef.current) {
      forceListingsReloadRef.current = false;
      previousFilterKey.current = key;
      if (typeof window !== 'undefined') {
        invalidateCache('bazaarListingsState');
      }
      setListings([]);
      setHasMore(false);
      setListingsOffset(0);
      setFeedCursor(null);
      feedCursorRef.current = null;
      setInitialLoading(true);
      fetchListings(true);
      return;
    }
    if (previousFilterKey.current === null) {
      previousFilterKey.current = key;
      return;
    }
    if (previousFilterKey.current === key) return;
    previousFilterKey.current = key;
    if (typeof window !== 'undefined') {
      invalidateCache('bazaarListingsState');
    }
    setListingsOffset(0);
    setFeedCursor(null);
    feedCursorRef.current = null;
    fetchListings(true);
  }, [
    filterKey,
    bazaarTabState.selectedCategory,
    bazaarTabState.selectedSubcategory,
    bazaarTabState.sortBy,
    bazaarTabState.showFreeOnly,
    bazaarTabState.selectedCities,
    bazaarTabState.minPrice,
    bazaarTabState.maxPrice,
    bazaarTabState.selectedCondition,
    bazaarTabState.selectedCurrency,
    debouncedSearchQuery,
    fetchListings,
  ]);

  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = async () => {
    // Очищаємо весь кеш при оновленні
    if (typeof window !== 'undefined') {
      invalidateCache('bazaarListingsState');
    }
    
    // Примусово оновлюємо дані
    await fetchListings(true);
    
    // Скидаємо позицію скролу після оновлення
    if (typeof window !== 'undefined') {
      // ВИДАЛЕНО: scrollPositionKey більше не використовується
    }
  };

  const { isPulling, pullDistance, pullProgress, isRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: false, // Вимкнено
    threshold: 120,
    tg
  });

  const [loadingMore, setLoadingMore] = useState(false);

  const loadMoreListings = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const response = await fetch(
        buildListingsUrl(PAGE_SIZE, listingsOffset, undefined, undefined, feedCursorRef.current)
      );
      if (response.ok) {
        const data = await response.json();
        const appended = data.listings || [];
        const total = data.total ?? 0;
        const newOffset = listingsOffset + appended.length;
        const nextCur = (data.nextCursor as string | null) || null;
        const newHasMore = Boolean(
          data.hasMore ?? (nextCur ? true : newOffset < total)
        );
        setListings((prev) => {
          const merged = [...prev, ...appended];
          if (!hasActiveFilters && !hasSearchQuery && typeof window !== 'undefined') {
            setCachedData('bazaarListingsState', {
              listings: merged,
              total,
              hasMore: newHasMore,
              offset: newOffset,
              timestamp: Date.now(),
            });
          }
          return merged;
        });
        setListingsOffset(newOffset);
        setTotalListings(total);
        setHasMore(newHasMore);
        setFeedCursor(nextCur);
        feedCursorRef.current = nextCur;
        prefetchListingsImages(appended, 4);
        tg?.HapticFeedback.impactOccurred('light');
      } else {
        showToast(t('common.loadingError'), 'error');
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
      showToast(t('common.loadingError'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [
    loadingMore,
    hasMore,
    listingsOffset,
    tg,
    showToast,
    buildListingsUrl,
    hasActiveFilters,
    hasSearchQuery,
    PAGE_SIZE,
    t,
  ]);

  const toggleFavorite = useCallback(
    async (id: number) => {
      const isFavorite = favorites.has(id);

      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.delete(id);
        else next.add(id);
        return next;
      });

      const delta = isFavorite ? -1 : 1;
      setListings((prev) => {
        const idx = prev.findIndex((l) => l.id === id);
        if (idx < 0) return prev;
        const listing = prev[idx];
        const next = prev.slice();
        next[idx] = {
          ...listing,
          favoritesCount: Math.max(0, (listing.favoritesCount || 0) + delta),
        };
        return next;
      });
      setSelectedListing((prev) =>
        prev && prev.id === id
          ? { ...prev, favoritesCount: Math.max(0, (prev.favoritesCount ?? 0) + delta) }
          : prev
      );

      tg?.HapticFeedback.notificationOccurred('success');

      if (isFavorite) {
        await removeFavoriteFromStorage(id, profile?.telegramId);
        showToast(t('listing.removeFromFavorites'), 'success');
      } else {
        await addFavoriteToStorage(id, profile?.telegramId);
        showToast(t('listing.addToFavorites'), 'success');
      }
    },
    [favorites, profile?.telegramId, tg, showToast, t]
  );

  // Покращена навігація - оновлюємо URL при зміні вибраного товару/профілю
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedListing) {
      url.searchParams.set('listing', selectedListing.id.toString());
      url.searchParams.delete('user');
      window.history.pushState({}, '', url.toString());
    } else if (selectedSeller) {
      url.searchParams.set('user', selectedSeller.telegramId);
      url.searchParams.delete('listing');
      window.history.pushState({}, '', url.toString());
    } else {
      url.searchParams.delete('listing');
      url.searchParams.delete('user');
      window.history.pushState({}, '', url.toString());
    }
  }, [selectedListing, selectedSeller]);

  // Обробка кнопки "Назад" в браузері
  useEffect(() => {
    const handlePopState = () => {
      if (!selectedListing && !selectedSeller) {
        return;
      }
      setSelectedListing(null);
      setSelectedSeller(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedListing, selectedSeller]);

  // Режим каталогу / оверлею — після закриття картки повертаємо скрол до оголошення в списку
  const prevSelectedListing = useRef<Listing | null>(null);

  useEffect(() => {
    const wasOpen =
      prevSelectedListing.current !== null || prevSelectedSeller.current !== null;
    const isNowClosed = selectedListing === null && selectedSeller === null;
    const isNewListing =
      prevSelectedListing.current !== null &&
      selectedListing !== null &&
      prevSelectedListing.current.id !== selectedListing.id;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    if (isNewListing) {
      prevSelectedListing.current = selectedListing;
      prevSelectedSeller.current = selectedSeller;
      return;
    }

    if (wasOpen && isNowClosed) {
      viewModeRef.current = 'catalog';
      if (skipCatalogScrollRestoreRef.current) {
        skipCatalogScrollRestoreRef.current = false;
        savedScrollPositionRef.current = 0;
        localStorage.setItem(scrollPositionKey, '0');
        if (typeof window !== 'undefined') {
          window.scrollTo(0, 0);
        }
      } else if (catalogOriginListingIdRef.current !== null) {
        const listingId = catalogOriginListingIdRef.current;
        scrollTimeoutRef.current = setTimeout(() => {
          scrollToListing(listingId);
          scrollTimeoutRef.current = null;
        }, 300);
      } else if (lastViewedListingIdRef.current !== null) {
        const listingId = lastViewedListingIdRef.current;
        scrollTimeoutRef.current = setTimeout(() => {
          scrollToListing(listingId);
          scrollTimeoutRef.current = null;
        }, 300);
      } else {
        scrollTimeoutRef.current = setTimeout(() => {
          restoreSavedScrollPosition();
          scrollTimeoutRef.current = null;
        }, 300);
      }
    }

    prevSelectedListing.current = selectedListing;
    prevSelectedSeller.current = selectedSeller;
  }, [selectedListing, selectedSeller, scrollToListing, restoreSavedScrollPosition]);
  
  // Мемоізуємо callbacks для запобігання непотрібних перерендерів (на верхньому рівні!)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);
  
  const handleCreateListing = useCallback(() => {
    setIsCreateListingModalOpen(true);
  }, []);
  
  const handleNavigateToCategories = useCallback(() => {
    router.push(`/${lang}/categories`);
  }, [router, lang]);
  
  const handleOpenCategoriesModal = useCallback(() => {
    setIsCategoriesModalOpen(true);
  }, []);

  const handleSelectListingFromCatalog = useCallback((listing: Listing) => {
    saveCatalogScrollPosition();
    listingHistoryStack.current = [];
    viewModeRef.current = 'listing';
    catalogOriginListingIdRef.current = listing.id;
    lastViewedListingIdRef.current = listing.id;
    persistBazaarReturnListingId(listing.id);
    setSelectedListing(listing);
  }, [saveCatalogScrollPosition]);

  const handleBazaarStateChange = useCallback((next: Partial<BazaarTabPersistedState>) => {
    startTransition(() => {
      setBazaarTabState((prev) => {
        const merged = { ...prev, ...next };
        if (
          prev.selectedCategory === merged.selectedCategory &&
          prev.selectedSubcategory === merged.selectedSubcategory &&
          prev.showFreeOnly === merged.showFreeOnly &&
          prev.sortBy === merged.sortBy &&
          prev.minPrice === merged.minPrice &&
          prev.maxPrice === merged.maxPrice &&
          prev.selectedCondition === merged.selectedCondition &&
          prev.selectedCurrency === merged.selectedCurrency &&
          JSON.stringify(prev.selectedCities) === JSON.stringify(merged.selectedCities)
        ) {
          return prev;
        }
        return merged;
      });
    });
  }, []);

  const handleRetryLoad = useCallback(() => {
    setListingsLoadError(false);
    fetchListings(true);
  }, [fetchListings]);

  const handleToast = useCallback(
    (message: string, type?: 'success' | 'error' | 'info') => {
      showToast(message, type ?? 'info');
    },
    [showToast]
  );

  const handleCloseListing = useCallback(() => {
    setSelectedListing(null);
    listingHistoryStack.current = [];
  }, []);

  const handleListingBack = useCallback(() => {
    if (listingHistoryStack.current.length > 0) {
      const previousListing = listingHistoryStack.current.pop()!;
      setSelectedListing(previousListing);
      return;
    }
    setSelectedListing(null);
    listingHistoryStack.current = [];
  }, []);

  const handleSelectRelatedListing = useCallback((listing: Listing) => {
    setSelectedListing((current) => {
      if (current) {
        listingHistoryStack.current.push(current);
      }
      return listing;
    });
    viewModeRef.current = 'listing';
    lastViewedListingIdRef.current = listing.id;
  }, []);

  const handleViewSellerProfile = useCallback(
    (
      telegramId: string,
      name: string,
      avatar: string,
      username?: string,
      phone?: string
    ) => {
      setSelectedListing((current) => {
        previousListingRef.current = current;
        return null;
      });
      setSelectedSeller({
        telegramId,
        name,
        avatar,
        username: username || undefined,
        phone: phone || undefined,
      });
    },
    []
  );

  const handleAutoRenewPersist = useCallback((id: number, autoRenew: boolean) => {
    setSelectedListing((prev) => (prev && prev.id === id ? { ...prev, autoRenew } : prev));
  }, []);

  const handleCloseSeller = useCallback(() => {
    previousListingRef.current = null;
    setSelectedSeller(null);
  }, []);

  const handleBackToPreviousListing = useCallback(() => {
    if (previousListingRef.current) {
      setSelectedListing(previousListingRef.current);
      previousListingRef.current = null;
      setSelectedSeller(null);
      return;
    }
    previousListingRef.current = null;
    setSelectedSeller(null);
  }, []);

  const handleSelectListingFromSeller = useCallback((listing: Listing) => {
    lastViewedListingIdRef.current = listing.id;
    setSelectedListing(listing);
  }, []);

  const overlayOpen = Boolean(selectedListing || selectedSeller);

  return {
    showBlockedScreen,
    lang,
    t,
    profile,
    categories,
    tg,
    toast,
    showToast,
    hideToast,
    searchQuery,
    handleSearchChange,
    listings,
    initialLoading,
    isListingsRefreshing,
    listingsLoadError,
    hasMore,
    loadMoreListings,
    loadingMore,
    handleRetryLoad,
    favorites,
    toggleFavorite,
    selectedListing,
    selectedSeller,
    overlayOpen,
    handleSelectListingFromCatalog,
    handleCloseListing,
    handleListingBack,
    handleSelectRelatedListing,
    openListingCategoryFromProduct,
    handleViewSellerProfile,
    handleCloseSeller,
    handleBackToPreviousListing,
    handleSelectListingFromSeller,
    handleAutoRenewPersist,
    previousListingRef,
    isCreateListingModalOpen,
    setIsCreateListingModalOpen,
    handleCreateListing,
    isCategoriesModalOpen,
    setIsCategoriesModalOpen,
    handleOpenCategoriesModal,
    selectedCategoryFromModal,
    setSelectedCategoryFromModal,
    fetchListings,
    handleToast,
    handleNavigateToCategories,
    handleBazaarStateChange,
    bazaarTabState,
    isPulling,
    pullDistance,
    pullProgress,
    isRefreshing,
    router,
    setSelectedListing,
    setSelectedSeller,
  };
}
