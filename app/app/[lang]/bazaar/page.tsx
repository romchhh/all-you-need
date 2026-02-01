'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Listing } from '@/types';
import { getCategories } from '@/constants/categories';
import { useTelegram } from '@/hooks/useTelegram';
import { ListingDetail } from '@/components/ListingDetail';
import { UserProfilePage } from '@/components/UserProfilePage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { BazaarTab } from '@/components/tabs/BazaarTab';
import { Toast } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { getFavoritesFromStorage, addFavoriteToStorage, removeFavoriteFromStorage } from '@/utils/favorites';
import { ListingGridSkeleton } from '@/components/SkeletonLoader';
import { getCachedData, setCachedData, invalidateCache } from '@/utils/cache';
import CreateListingFlow from '@/components/CreateListingFlow';
import { CategoriesModal } from '@/components/CategoriesModal';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useActivityHeartbeat } from '@/hooks/useActivityHeartbeat';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDebounce } from '@/hooks/useDebounce';
import { useAutoPrefetch } from '@/hooks/usePrefetch';
import { logTelegramEnvironment } from '@/utils/telegramDebug';
import { AppHeader } from '@/components/AppHeader';

const BazaarPage = () => {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  
  // Автоматичний prefetching для покращення UX
  useAutoPrefetch(pathname);
  
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { profile, isBlocked } = useUser();

  if (isBlocked && !profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-white text-lg font-medium mb-2">⛔ {t('common.blocked')}</p>
        <p className="text-white/70 text-sm">{t('menu.support') || 'Підтримка'}</p>
      </div>
    );
  }

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
  
  // Отримуємо категорії з перекладами
  const categories = getCategories(t);
  
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
  
  const [isTyping, setIsTyping] = useState(false);
  
  // Debounce для пошуку - збільшено до 800ms для максимальної плавності
  const debouncedSearchQuery = useDebounce(searchQuery, 800);
  
  // useDeferredValue для неблокуючого оновлення UI
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [selectedCategoryFromModal, setSelectedCategoryFromModal] = useState<string | null>(null);
  const previousListingRef = useRef<Listing | null>(null); // Зберігаємо картку товару перед відкриттям профілю продавця
  const prevSelectedSeller = useRef<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const lastViewedListingIdRef = useRef<number | null>(null); // Зберігаємо ID останнього переглянутого товару
  const viewModeRef = useRef<'catalog' | 'listing'>('catalog'); // Явний режим перегляду
  
  // КРИТИЧНО: Вимикаємо автоматичне відновлення scroll браузером
  // Це обов'язково для мобільних WebView
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);
  
  // Зберігаємо пошуковий запит в localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bazaarSearchQuery', searchQuery);
    }
  }, [searchQuery]);
  
  // Зберігаємо стан для вкладки bazaar
  const [bazaarTabState, setBazaarTabState] = useState<{
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    selectedCities: string[];
    minPrice: number | null;
    maxPrice: number | null;
    selectedCondition: 'new' | 'used' | null;
    selectedCurrency: string | null;
    sortBy: 'newest' | 'price_low' | 'price_high' | 'popular';
    showFreeOnly: boolean;
  }>(() => {
    // Завантажуємо збережений стан з localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          // ignore
        }
      }
    }
    return {
      selectedCategory: null,
      selectedSubcategory: null,
      selectedCities: [],
      minPrice: null,
      maxPrice: null,
      selectedCondition: null,
      selectedCurrency: null,
      sortBy: 'newest',
      showFreeOnly: false,
    };
  });
  
  // ВИДАЛЕНО: Збереження скролу при скролі - не потрібно, зберігаємо тільки перед відкриттям

  // Зберігаємо стан в localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bazaarTabState', JSON.stringify(bazaarTabState));
    }
  }, [bazaarTabState]);

  // Завантажуємо обране з localStorage при завантаженні
  useEffect(() => {
    const favorites = getFavoritesFromStorage();
    setFavorites(favorites);
  }, []);

  const PAGE_SIZE = 20;

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [totalListings, setTotalListings] = useState(0);
  const [listingsOffset, setListingsOffset] = useState(0);
  const { tg } = useTelegram();

  /** Побудова URL для API оголошень з поточними фільтрами та пошуком (щоб пагінація і «Показати більше» працювали коректно). */
  const buildListingsUrl = useCallback((limit: number, offset: number, searchQueryForApi?: string) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    params.set('sortBy', bazaarTabState.sortBy || 'newest');
    if (bazaarTabState.selectedCategory) params.set('category', bazaarTabState.selectedCategory);
    if (bazaarTabState.selectedSubcategory) params.set('subcategory', bazaarTabState.selectedSubcategory);
    if (bazaarTabState.showFreeOnly) params.set('isFree', 'true');
    const searchTrimmed = (searchQueryForApi ?? debouncedSearchQuery ?? '').trim();
    if (searchTrimmed) params.set('search', searchTrimmed);
    return `/api/listings?${params.toString()}`;
  }, [bazaarTabState.sortBy, bazaarTabState.selectedCategory, bazaarTabState.selectedSubcategory, bazaarTabState.showFreeOnly, debouncedSearchQuery]);
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

  const hasActiveFilters = Boolean(
    bazaarTabState.selectedCategory || bazaarTabState.selectedSubcategory || bazaarTabState.showFreeOnly
  );
  const hasSearchQuery = Boolean((debouncedSearchQuery ?? '').trim());

  // Функція завантаження оголошень (з фільтрами та пошуком)
  const fetchListings = useCallback(async (forceRefresh: boolean = false, initialSearch?: string) => {
    try {
      setLoading(true);

      const searchForRequest = (initialSearch ?? debouncedSearchQuery ?? '').trim();
      const useSearch = Boolean(searchForRequest);

      // Кеш тільки без фільтрів, без пошуку і без примусового оновлення
      if (!forceRefresh && !hasActiveFilters && !useSearch && typeof window !== 'undefined') {
        const cachedState = sessionStorage.getItem('bazaarListingsState');
        if (cachedState) {
          try {
            const parsed = JSON.parse(cachedState);
            const cacheAge = Date.now() - (parsed.timestamp || 0);
            if (cacheAge < 5 * 60 * 1000) {
              setListings(parsed.listings || []);
              setTotalListings(parsed.total || 0);
              setHasMore((parsed.listings?.length ?? 0) < (parsed.total ?? 0));
              setListingsOffset(parsed.offset ?? PAGE_SIZE);
              setLoading(false);
              return;
            }
          } catch (e) {
            // продовжуємо завантаження
          }
        }
      }

      const response = await fetch(buildListingsUrl(PAGE_SIZE, 0, searchForRequest || undefined));
      if (response.ok) {
        const data = await response.json();
        const list = data.listings || [];
        const total = data.total ?? 0;
        const more = list.length < total;
        setListings(list);
        setTotalListings(total);
        setHasMore(more);
        setListingsOffset(list.length);

        if (!hasActiveFilters && !useSearch && typeof window !== 'undefined') {
          setCachedData('bazaarListingsState', {
            listings: list,
            total,
            hasMore: more,
            offset: list.length,
            timestamp: Date.now()
          });
        }
      } else {
        console.error('Failed to fetch listings:', response.status);
        setListings([]);
        setTotalListings(0);
        setHasMore(false);
        setListingsOffset(0);
        showToast(t('common.loadingError'), 'error');
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
      setListings([]);
      setTotalListings(0);
      setHasMore(false);
      setListingsOffset(0);
      showToast(t('common.loadingError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t, buildListingsUrl, hasActiveFilters, hasSearchQuery, PAGE_SIZE]);

  const hasLoadedListings = useRef(false);
  const previousFilterKey = useRef<string | null>(null);

  // Ключ фільтрів (категорія, пошук тощо) — однаковий формат для першого завантаження та рефетчу
  const filterKey = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${(debouncedSearchQuery ?? '').trim()}`;

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
      setLoading(false);
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

  // При зміні фільтрів або пошуку — перезавантажити з offset 0
  useEffect(() => {
    const key = `${bazaarTabState.selectedCategory}|${bazaarTabState.selectedSubcategory}|${bazaarTabState.sortBy}|${bazaarTabState.showFreeOnly}|${(debouncedSearchQuery ?? '').trim()}`;
    if (previousFilterKey.current === null) {
      previousFilterKey.current = key;
      return;
    }
    if (previousFilterKey.current === key) return;
    previousFilterKey.current = key;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('bazaarListingsState');
      localStorage.removeItem('bazaarListingsState');
    }
    setListings([]);
    setListingsOffset(0);
    setTotalListings(0);
    setHasMore(false);
    fetchListings(true);
  }, [bazaarTabState.selectedCategory, bazaarTabState.selectedSubcategory, bazaarTabState.sortBy, bazaarTabState.showFreeOnly, debouncedSearchQuery, fetchListings]);


  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = async () => {
    // Очищаємо весь кеш при оновленні
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bazaarListingsState');
      localStorage.removeItem('bazaarListings');
      localStorage.removeItem('bazaarListingsOffset');
      invalidateCache('listings');
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

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (loadingMore || !hasMore) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      if (scrollTop + windowHeight >= documentHeight - 300) {
        loadMoreListings();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, loadMoreListings]);

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

  // ПРОСТА ЛОГІКА СКРОЛУ: зберігаємо ID товару, при закритті скролимо до нього
  const prevSelectedListing = useRef<Listing | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Функція для скролу до товару за ID (тільки в режимі каталогу)
  const scrollToListing = useCallback((listingId: number) => {
    if (typeof window === 'undefined' || viewModeRef.current !== 'catalog') return;
    
    const scrollToElement = (attempt: number = 0) => {
      // Перевіряємо, що ми все ще в каталозі
      if (viewModeRef.current !== 'catalog') return false;
      
      const element = document.querySelector(`[data-listing-id="${listingId}"]`) as HTMLElement;
      
      if (element) {
        // Знайшли елемент - скролимо до нього (auto для миттєвості)
        element.scrollIntoView({ 
          behavior: 'auto', 
          block: 'center',
          inline: 'nearest'
        });
        return true;
      } else if (attempt < 10) {
        // Елемент не знайдено - спробуємо ще раз
        setTimeout(() => scrollToElement(attempt + 1), 200);
        return false;
      }
      return false;
    };
    
    // Починаємо спроби через затримку для мобільних WebView
    setTimeout(() => scrollToElement(), 300);
  }, []);
  
  // Відновлюємо скрол до товару ПІСЛЯ закриття ListingDetail
  useEffect(() => {
    const wasOpen = prevSelectedListing.current !== null || prevSelectedSeller.current !== null;
    const isNowClosed = selectedListing === null && selectedSeller === null;
    const isNewListing = prevSelectedListing.current !== null && selectedListing !== null && prevSelectedListing.current.id !== selectedListing.id;
    
    // Скасовуємо попередній таймаут скролу (якщо є)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    // Якщо відкрили НОВИЙ товар - залишаємося в режимі товару
    if (isNewListing) {
      prevSelectedListing.current = selectedListing;
      prevSelectedSeller.current = selectedSeller;
      return;
    }
    
    // Якщо щойно закрили - переходимо в режим каталогу і скролимо до товару
    if (wasOpen && isNowClosed) {
      viewModeRef.current = 'catalog';
      
      if (lastViewedListingIdRef.current !== null) {
        const listingId = lastViewedListingIdRef.current;
        
        // Затримка для мобільних WebView (вони потребують більше часу)
        scrollTimeoutRef.current = setTimeout(() => {
          scrollToListing(listingId);
          scrollTimeoutRef.current = null;
        }, 300);
      }
    }
    
    // Оновлюємо refs
    prevSelectedListing.current = selectedListing;
    prevSelectedSeller.current = selectedSeller;
  }, [selectedListing, selectedSeller, scrollToListing]);
  
  // Мемоізуємо callbacks для запобігання непотрібних перерендерів (на верхньому рівні!)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setIsTyping(true);
    
    // Скидаємо isTyping через короткий час
    const timer = setTimeout(() => {
      setIsTyping(false);
    }, 300);
    
    return () => clearTimeout(timer);
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
  
  const renderContent = () => {
    if (selectedSeller) {
      return (
        <UserProfilePage
          sellerTelegramId={selectedSeller.telegramId}
          sellerName={selectedSeller.name}
          sellerAvatar={selectedSeller.avatar}
          sellerUsername={selectedSeller.username}
          sellerPhone={selectedSeller.phone}
          onClose={() => {
            previousListingRef.current = null; // Очищаємо збережену картку
            setSelectedSeller(null);
          }}
          onBackToPreviousListing={
            // Перевіряємо, чи є збережена картка товару
            previousListingRef.current 
              ? () => {
                  // Відновлюємо картку товару
                  setSelectedListing(previousListingRef.current);
                  previousListingRef.current = null; // Очищаємо після використання
                  setSelectedSeller(null);
                }
              : null
          }
          onSelectListing={(listing) => {
            // Зберігаємо ID товару для скролу при поверненні
            lastViewedListingIdRef.current = listing.id;
            
            // Скролимо нагору ПЕРЕД встановленням selectedListing
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            
            setSelectedListing(listing);
          }}
          onToggleFavorite={toggleFavorite}
          favorites={favorites}
          tg={tg}
        />
      );
    }

    if (selectedListing) {
      return (
        <ListingDetail
          key={selectedListing.id}
          listing={selectedListing}
          isFavorite={favorites.has(selectedListing.id)}
          onClose={() => {
            setSelectedListing(null);
          }}
          onBack={() => {
            setSelectedListing(null);
          }}
          onToggleFavorite={toggleFavorite}
          onSelectListing={(listing) => {
            // Переходимо в режим товару
            viewModeRef.current = 'listing';
            
            // Зберігаємо ID товару для скролу при поверненні
            lastViewedListingIdRef.current = listing.id;
            
            // ЖОРСТКО фіксуємо scroll на 0 - СИНХРОННО
            document.body.style.scrollBehavior = 'auto';
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            
            setSelectedListing(listing);
          }}
          onViewSellerProfile={(telegramId, name, avatar, username, phone) => {
            // Зберігаємо посилання на картку товару перед відкриттям профілю
            previousListingRef.current = selectedListing;
            setSelectedSeller({ 
              telegramId, 
              name, 
              avatar,
              username: username || undefined,
              phone: phone || undefined
            });
            setSelectedListing(null);
          }}
          favorites={favorites}
          tg={tg}
        />
      );
    }

    if (loading) {
      return <ListingGridSkeleton count={6} showLoadingText={true} loadingText={t('common.loading')} />;
    }

    return (
      <BazaarTab
        categories={categories}
        listings={listings}
        searchQuery={searchQuery}
        deferredSearchQuery={deferredSearchQuery}
        onSearchChange={handleSearchChange}
        favorites={favorites}
        onSelectListing={(listing) => {
          // Переходимо в режим товару
          viewModeRef.current = 'listing';
          
          // Зберігаємо ID товару для скролу при поверненні
          lastViewedListingIdRef.current = listing.id;
          
          // ЖОРСТКО фіксуємо scroll на 0 - СИНХРОННО, без behavior, без затримок
          // Це критично для мобільних WebView
          document.body.style.scrollBehavior = 'auto';
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          
          // Зберігаємо поточний стан списку в localStorage
          if (typeof window !== 'undefined' && listings.length > 0) {
            localStorage.setItem('bazaarListingsState', JSON.stringify({
              listings: listings,
              total: totalListings,
              hasMore: hasMore,
              offset: listingsOffset,
              timestamp: Date.now()
            }));
          }
          
          // Встановлюємо selectedListing ПІСЛЯ фіксації scroll
          setSelectedListing(listing);
        }}
        onToggleFavorite={toggleFavorite}
        onCreateListing={handleCreateListing}
        hasMore={hasMore}
        onLoadMore={loadMoreListings}
        onNavigateToCategories={handleNavigateToCategories}
        onOpenCategoriesModal={handleOpenCategoriesModal}
        initialSelectedCategory={selectedCategoryFromModal}
        savedState={bazaarTabState}
        onStateChange={setBazaarTabState}
        tg={tg}
      />
    );
  };

  return (
    <div className="min-h-screen pb-20 overflow-x-hidden max-w-full">
      {!selectedListing && <AppHeader />}
      {/* Покращений pull-to-refresh індикатор */}
      {isPulling && (
        <div 
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-50 pointer-events-none"
          style={{
            height: `${Math.min(pullDistance * 0.8, 100)}px`,
            opacity: Math.min(pullProgress * 1.2, 1),
            transform: `translateY(${Math.min(pullDistance * 0.4 - 50, 0)}px)`,
            transition: isRefreshing ? 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
          }}
        >
          <div 
            className="flex flex-col items-center gap-2 px-5 py-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100"
            style={{
              transform: `scale(${Math.min(0.85 + pullProgress * 0.15, 1)}) translateY(${isRefreshing ? '0' : `${-pullDistance * 0.1}px`})`,
              transition: isRefreshing ? 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.2s ease-out',
              boxShadow: `0 ${10 + pullProgress * 10}px ${20 + pullProgress * 10}px rgba(0, 0, 0, ${0.1 + pullProgress * 0.05})`
            }}
          >
            {isRefreshing ? (
              <>
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 border-3 border-blue-200 rounded-full"></div>
                  <div className="absolute inset-0 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <span className="text-sm font-semibold text-blue-600">{t('common.loading')}</span>
              </>
            ) : pullProgress >= 1 ? (
              <>
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <span className="text-sm font-semibold text-blue-600">Відпустіть для оновлення</span>
              </>
            ) : (
              <>
                <div 
                  className="relative w-8 h-8"
                  style={{
                    transform: `rotate(${pullProgress * 360}deg)`,
                    transition: 'transform 0.1s ease-out'
                  }}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                    <circle 
                      cx="12" 
                      cy="12" 
                      r="9" 
                      stroke="currentColor" 
                      strokeWidth="2.5"
                      className="text-gray-200"
                    />
                    <circle 
                      cx="12" 
                      cy="12" 
                      r="9" 
                      stroke="url(#gradient)" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${56.5 * pullProgress} ${56.5 * (1 - pullProgress)}`}
                      className="transition-all duration-200"
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="100%" stopColor="#60A5FA" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{
                      transform: `translateY(${-2 + pullProgress * 2}px)`,
                      opacity: 0.6 + pullProgress * 0.4
                    }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                </div>
                <span 
                  className="text-xs font-medium text-gray-500"
                  style={{
                    opacity: 0.6 + pullProgress * 0.4
                  }}
                >
                  {pullProgress > 0.7 ? 'Майже...' : t('common.pullToRefresh')}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto w-full overflow-x-hidden">
        {renderContent()}
      </div>

      <BottomNavigation
        activeTab="bazaar"
        onTabChange={(tab) => {
          // Закриваємо деталі товару перед переходом
          const hasOpenDetails = selectedListing || selectedSeller;
          if (hasOpenDetails) {
            setSelectedListing(null);
            setSelectedSeller(null);
          }
          
          // Зберігаємо telegramId при навігації
          let telegramId = new URLSearchParams(window.location.search).get('telegramId');
          
          // Якщо немає в URL, беремо з sessionStorage
          if (!telegramId) {
            telegramId = sessionStorage.getItem('telegramId');
          }
          
          const queryString = telegramId ? `?telegramId=${telegramId}` : '';
          const targetPath = tab === 'bazaar' ? 'bazaar' : tab === 'favorites' ? 'favorites' : tab === 'profile' ? 'profile' : 'categories';
          
          // Якщо були відкриті деталі, використовуємо більшу затримку для закриття перед переходом
          if (hasOpenDetails) {
            setTimeout(() => {
              router.push(`/${lang}/${targetPath}${queryString}`);
            }, 100);
          } else {
            // Якщо деталі не відкриті, переходимо одразу
            router.push(`/${lang}/${targetPath}${queryString}`);
          }
        }}
        onCloseDetail={() => {
          setSelectedListing(null);
          setSelectedSeller(null);
        }}
        onCreateListing={() => setIsCreateListingModalOpen(true)}
        favoritesCount={favorites.size}
        tg={tg}
      />

      <CategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        onSelectCategory={(categoryId) => {
          setSelectedCategoryFromModal(categoryId);
        }}
        tg={tg}
      />

      {profile && (
        <CreateListingFlow
          isOpen={isCreateListingModalOpen}
          onClose={() => setIsCreateListingModalOpen(false)}
          onSuccess={async () => {
            // Очищаємо кеш та примусово оновлюємо дані після створення нового товару
            if (typeof window !== 'undefined') {
              localStorage.removeItem('bazaarListingsState');
            }
            await fetchListings(true);
            setIsCreateListingModalOpen(false);
            showToast(t('createListing.listingCreated'), 'success');
          }}
          tg={tg}
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

export default BazaarPage;

