'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from 'react';
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
import {
  consumePendingListingCategory,
  resolveListingCategoryFilter,
  toBazaarHomeCategoryFilter,
  type ListingCategoryFilter,
} from '@/lib/listings/categoryFilter';

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

  // Підключаємо heartbeat для оновлення активності
  useActivityHeartbeat();
  
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
  const skipCatalogScrollRestoreRef = useRef(false); // Перехід у категорію з картки — не скролити до старого товару
  const forceListingsReloadRef = useRef(false);
  const previousFilterKey = useRef<string | null>(null);
  const appliedDeepLinkCategoryRef = useRef<string | null>(null);
  const listingsCountRef = useRef(0);
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
  
  // ВИДАЛЕНО: Збереження скролу при скролі - не потрібно, зберігаємо тільки перед відкриттям

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

  const [listings, setListings] = useState<Listing[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isListingsRefreshing, setIsListingsRefreshing] = useState(false);
  const [listingsLoadError, setListingsLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalListings, setTotalListings] = useState(0);
  const [listingsOffset, setListingsOffset] = useState(0);
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
      stateOverride?: BazaarTabPersistedState
    ) => {
      const state = stateOverride ?? bazaarTabState;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('sortBy', state.sortBy || 'newest');
      if (state.selectedCategory) params.set('category', state.selectedCategory);
      if (state.selectedSubcategory) params.set('subcategory', state.selectedSubcategory);
      if (state.showFreeOnly) params.set('isFree', 'true');
      if (state.selectedCities?.length > 0) {
        params.set('cities', state.selectedCities.join(','));
      }
      const searchTrimmed = (searchQueryForApi ?? debouncedSearchQuery ?? '').trim();
      if (searchTrimmed) {
        params.set('search', searchTrimmed);
      }
      return `/api/listings?${params.toString()}`;
    },
    [
      bazaarTabState,
      debouncedSearchQuery,
    ]
  );
  const { toast, showToast, hideToast } = useToast();
  
  // ВИДАЛЕНО: Вся складна логіка з isReturningFromListing, scrollToLastViewedListing, 
  // isInitialMount, hasScrolledOnThisMount, sessionStorage, referrer
  // Замість неї проста логіка нижче (рядки 650-687)

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
          (state.selectedCities?.length ?? 0) > 0
      ),
    []
  );

  const hasActiveFilters = hasActiveFiltersForState(bazaarTabState);
  const hasSearchQuery = Boolean((debouncedSearchQuery ?? '').trim());

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

    try {
      const searchForRequest = (initialSearch ?? debouncedSearchQuery ?? '').trim();
      const useSearch = Boolean(searchForRequest);

      // Кеш тільки без фільтрів, без пошуку і без примусового оновлення
      if (!forceRefresh && !requestHasActiveFilters && !useSearch && typeof window !== 'undefined') {
        const cached = getCachedData('bazaarListingsState');
        if (cached?.listings?.length) {
          const cacheAge = Date.now() - (cached.timestamp || 0);
          if (cacheAge < 5 * 60 * 1000) {
            setListings(cached.listings || []);
            setTotalListings(cached.total || 0);
            setHasMore((cached.listings?.length ?? 0) < (cached.total ?? 0));
            setListingsOffset(cached.offset ?? PAGE_SIZE);
            setInitialLoading(false);
            setIsListingsRefreshing(false);
            return;
          }
        }
      }

      const response = await fetch(
        buildListingsUrl(PAGE_SIZE, 0, searchForRequest || undefined, requestState)
      );
      if (response.ok) {
        setListingsLoadError(false);
        const data = await response.json();
        const list = data.listings || [];
        const total = data.total ?? 0;
        const more = list.length < total;
        setListings(list);
        setTotalListings(total);
        setHasMore(more);
        setListingsOffset(list.length);

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
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching listings:', error);
      }
      setListings([]);
      setTotalListings(0);
      setHasMore(false);
      setListingsOffset(0);
      setListingsLoadError(true);
    } finally {
      setInitialLoading(false);
      setIsListingsRefreshing(false);
    }
  }, [showToast, t, buildListingsUrl, hasActiveFiltersForState, bazaarTabState, debouncedSearchQuery, PAGE_SIZE]);

  const hasLoadedListings = useRef(false);

  // Ключ фільтрів (категорія, міста, пошук тощо) — однаковий формат для першого завантаження та рефетчу
  const filterKey = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${(bazaarTabState.selectedCities ?? []).join(',')}|${(debouncedSearchQuery ?? '').trim()}`;

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
      return;
    }

    if (!hasLoadedListings.current) {
      hasLoadedListings.current = true;
      // Ключ з поточним пошуком (щоб після debounce не робити зайвий рефетч)
      previousFilterKey.current = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${searchTrimmed}`;
      // Якщо в полі пошуку вже є текст (наприклад з localStorage) — одразу завантажуємо з пошуком
      fetchListings(false, searchTrimmed || undefined);
    }
  }, [fetchListings, hasActiveFilters, hasSearchQuery, bazaarTabState.selectedCategory, bazaarTabState.selectedSubcategory, bazaarTabState.sortBy, bazaarTabState.showFreeOnly, debouncedSearchQuery, filterKey, searchQuery]);

  // При зміні фільтрів (включно з містами) або пошуку — перезавантажити з offset 0
  useEffect(() => {
    const key = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${(bazaarTabState.selectedCities ?? []).join(',')}|${(debouncedSearchQuery ?? '').trim()}`;
    if (forceListingsReloadRef.current) {
      forceListingsReloadRef.current = false;
      previousFilterKey.current = key;
      if (typeof window !== 'undefined') {
        invalidateCache('bazaarListingsState');
      }
      setListings([]);
      setHasMore(false);
      setListingsOffset(0);
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
    setListings([]);
    setHasMore(false);
    setListingsOffset(0);
    setInitialLoading(true);
    fetchListings(true);
  }, [bazaarTabState.selectedCategory, bazaarTabState.selectedSubcategory, bazaarTabState.sortBy, bazaarTabState.showFreeOnly, bazaarTabState.selectedCities, debouncedSearchQuery, fetchListings]);


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
      const response = await fetch(buildListingsUrl(PAGE_SIZE, listingsOffset));
      if (response.ok) {
        const data = await response.json();
        const appended = data.listings || [];
        const total = data.total ?? 0;
        const newListings = [...listings, ...appended];
        const newOffset = listingsOffset + appended.length;
        const newHasMore = newOffset < total;
        setListings(newListings);
        setListingsOffset(newOffset);
        setTotalListings(total);
        setHasMore(newHasMore);
        tg?.HapticFeedback.impactOccurred('light');
        if (!hasActiveFilters && !hasSearchQuery && typeof window !== 'undefined') {
          setCachedData('bazaarListingsState', {
            listings: newListings,
            total,
            hasMore: newHasMore,
            offset: newOffset,
            timestamp: Date.now()
          });
        }
      } else {
        showToast(t('common.loadingError'), 'error');
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
      showToast(t('common.loadingError'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, listingsOffset, listings, tg, showToast, buildListingsUrl, hasActiveFilters, PAGE_SIZE]);

  const toggleFavorite = async (id: number) => {
    const isFavorite = favorites.has(id);
    
    // Оптимістичне оновлення UI
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (isFavorite) {
        newFavorites.delete(id);
      } else {
        newFavorites.add(id);
      }
      return newFavorites;
    });

    // Оновлюємо лічильник лайків на картці товару та в деталях (включно з власними оголошеннями)
    const delta = isFavorite ? -1 : 1;
    setListings(prev => prev.map(listing => 
      listing.id === id 
        ? { 
            ...listing, 
            favoritesCount: Math.max(0, (listing.favoritesCount || 0) + delta)
          }
        : listing
    ));
    setSelectedListing(prev => prev && prev.id === id ? { ...prev, favoritesCount: Math.max(0, (prev.favoritesCount ?? 0) + delta) } : prev);

    tg?.HapticFeedback.notificationOccurred('success');
    
    // Виконуємо операцію (localStorage + БД для статистики)
    if (isFavorite) {
      await removeFavoriteFromStorage(id, profile?.telegramId);
      showToast(t('listing.removeFromFavorites'), 'success');
    } else {
      await addFavoriteToStorage(id, profile?.telegramId);
      showToast(t('listing.addToFavorites'), 'success');
    }
  };

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

  // Режим каталогу / оверлею — скрол каталогу зберігається, бо BazaarTab лишається в DOM
  const prevSelectedListing = useRef<Listing | null>(null);

  useEffect(() => {
    const wasOpen = prevSelectedListing.current !== null || prevSelectedSeller.current !== null;
    const isNowClosed = selectedListing === null && selectedSeller === null;

    if (wasOpen && isNowClosed) {
      viewModeRef.current = 'catalog';
      if (skipCatalogScrollRestoreRef.current) {
        skipCatalogScrollRestoreRef.current = false;
        if (typeof window !== 'undefined') {
          window.scrollTo(0, 0);
        }
      }
    }

    prevSelectedListing.current = selectedListing;
    prevSelectedSeller.current = selectedSeller;
  }, [selectedListing, selectedSeller]);
  
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
    listingHistoryStack.current = [];
    viewModeRef.current = 'listing';
    lastViewedListingIdRef.current = listing.id;
    setSelectedListing(listing);
  }, []);

  const handleBazaarStateChange = useCallback((next: Partial<BazaarTabPersistedState>) => {
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
    if (!previousListingRef.current) return;
    setSelectedListing(previousListingRef.current);
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
