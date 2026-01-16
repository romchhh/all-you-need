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
  const { profile } = useUser();
  
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
  const savedScrollPositionRef = useRef<number>(0);
  const scrollPositionKey = 'bazaarScrollPosition';
  const lastViewedListingIdKey = 'bazaarLastViewedListingId';
  
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
  
  // Зберігаємо позицію скролу при скролі
  useEffect(() => {
    if (selectedListing || selectedSeller) return;
    
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (typeof window !== 'undefined') {
        localStorage.setItem(scrollPositionKey, scrollY.toString());
      }
    };
    
    // Throttle scroll events
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

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [totalListings, setTotalListings] = useState(0);
  const [listingsOffset, setListingsOffset] = useState(0);
  const { tg } = useTelegram();
  const { toast, showToast, hideToast } = useToast();
  
  // Перевіряємо, чи користувач повертається назад з товару
  const isReturningFromListing = useRef(false);
  
  useEffect(() => {
    // Перевіряємо sessionStorage - чи було відкрито товар в цій сесії
    if (typeof window !== 'undefined') {
      const wasViewingListing = sessionStorage.getItem('wasViewingListing');
      if (wasViewingListing === 'true') {
        // Додаткова перевірка - чи це дійсно повернення з товару
        // Якщо referrer не містить поточний URL, значить це не повернення назад
        const referrer = document.referrer;
        const currentUrl = window.location.href;
        const isBackNavigation = referrer && referrer.includes(currentUrl.split('?')[0]);
        
        if (isBackNavigation || referrer === '') {
          isReturningFromListing.current = true;
        }
        // Очищаємо прапорець після використання
        sessionStorage.removeItem('wasViewingListing');
      }
    }
  }, []);
  
  // Відстежуємо відкриття товару
  useEffect(() => {
    if (selectedListing && typeof window !== 'undefined') {
      // Зберігаємо прапорець, що користувач переглядає товар
      sessionStorage.setItem('wasViewingListing', 'true');
    }
  }, [selectedListing]);
  
  // Функція для скролу до останнього переглянутого оголошення
  const scrollToLastViewedListing = useCallback(() => {
    // Скролимо тільки якщо користувач повертається назад з товару
    if (!isReturningFromListing.current) {
      return;
    }
    
    if (typeof window === 'undefined' || selectedListing || selectedSeller || listings.length === 0) {
      return;
    }
    
    const lastViewedId = localStorage.getItem(lastViewedListingIdKey);
    if (!lastViewedId) {
      return;
    }
    
    const listingId = parseInt(lastViewedId, 10);
    if (isNaN(listingId)) {
      return;
    }
    
    // Перевіряємо, чи є це оголошення в поточному списку
    const listingExists = listings.some(l => l.id === listingId);
    if (!listingExists) {
      // Оголошення немає в списку (можливо, фільтрується) - використовуємо fallback
      const savedPosition = localStorage.getItem(scrollPositionKey);
      if (savedPosition) {
        const position = parseInt(savedPosition, 10);
        if (!isNaN(position) && position > 0) {
          window.scrollTo({ top: position, behavior: 'auto' });
        }
      }
      return;
    }
    
    // Спробуємо знайти елемент кілька разів з різними затримками
    const tryScroll = (attempt: number = 0) => {
      // Шукаємо елемент, навіть якщо він прихований
      const listingElement = document.querySelector(`[data-listing-id="${listingId}"]`) as HTMLElement;
      
      if (listingElement) {
        // Елемент знайдено - прокручуємо до нього
        // Використовуємо scrollIntoView для надійності
        listingElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        // Скидаємо прапорець після успішного скролу
        isReturningFromListing.current = false;
        return true;
      } else if (attempt < 10) {
        // Елемент не знайдено - спробуємо ще раз через деякий час
        // Збільшуємо кількість спроб, бо елемент може завантажуватися
        setTimeout(() => tryScroll(attempt + 1), 300);
        return false;
      } else {
        // Елемент не знайдено після багатьох спроб - використовуємо fallback
        const savedPosition = localStorage.getItem(scrollPositionKey);
        if (savedPosition) {
          const position = parseInt(savedPosition, 10);
          if (!isNaN(position) && position > 0) {
            window.scrollTo({ top: position, behavior: 'auto' });
          }
        }
        // Скидаємо прапорець навіть якщо не знайшли елемент
        isReturningFromListing.current = false;
        return false;
      }
    };
    
    // Починаємо спроби через невелику затримку, щоб DOM встиг відрендеритися
    setTimeout(() => tryScroll(), 300);
  }, [selectedListing, selectedSeller, listings]);
  
  // Відновлюємо скролл при першому завантаженні або поверненні на сторінку
  const isInitialMount = useRef(true);
  const lastPathname = useRef<string | null>(null);
  const hasScrolledOnThisMount = useRef(false);
  
  useEffect(() => {
    // Перевіряємо, чи це повернення на сторінку bazaar
    const isBazaarPage = pathname?.includes('/bazaar');
    const wasOnBazaar = lastPathname.current?.includes('/bazaar');
    const returnedToBazaar = !wasOnBazaar && isBazaarPage;
    
    // Якщо повернулися на сторінку, скидаємо прапорець
    if (returnedToBazaar) {
      hasScrolledOnThisMount.current = false;
    }
    
    // НЕ відновлюємо скрол, якщо щось відкрите
    if (selectedListing || selectedSeller) {
      return;
    }
    
    // Скролимо до товару тільки якщо користувач повертається назад з товару
    if (isReturningFromListing.current && listings.length > 0 && !selectedListing && !selectedSeller && !hasScrolledOnThisMount.current) {
      hasScrolledOnThisMount.current = true;
      
      // Невелика затримка, щоб DOM встиг відрендеритися
      setTimeout(() => {
        scrollToLastViewedListing();
      }, 500);
    } else if (isInitialMount.current) {
      // При першому завантаженні або заході з інших сторінок - залишаємося зверху
      isInitialMount.current = false;
      hasScrolledOnThisMount.current = true;
    }
    
    lastPathname.current = pathname || null;
  }, [pathname, listings.length, selectedListing, selectedSeller, scrollToLastViewedListing]);
  
  // Відновлюємо скролл при закритті деталей оголошення
  const prevSelectedListing = useRef<Listing | null>(null);
  useEffect(() => {
    const wasOpen = prevSelectedListing.current !== null;
    const isNowClosed = selectedListing === null;
    
    if (wasOpen && isNowClosed && listings.length > 0) {
      // Користувач щойно закрив деталі - прокручуємо до оголошення
      // Перевіряємо, чи встановлений прапорець повернення
      if (isReturningFromListing.current && !hasScrolledOnThisMount.current) {
        hasScrolledOnThisMount.current = true;
        // Затримка, щоб DOM встиг оновитися
      setTimeout(() => {
        scrollToLastViewedListing();
        }, 600);
      }
    }
    
    prevSelectedListing.current = selectedListing;
  }, [selectedListing, listings.length, scrollToLastViewedListing]);

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
              savedScrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
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
              savedScrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
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

  // Функція завантаження оголошень
  const fetchListings = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      
      // Перевіряємо кеш тільки якщо не примусове оновлення
      if (!forceRefresh && typeof window !== 'undefined') {
        const cachedState = sessionStorage.getItem('bazaarListingsState');
        if (cachedState) {
          try {
            const parsed = JSON.parse(cachedState);
            // Перевіряємо, чи кеш не старіший за 5 хвилин
            const cacheAge = Date.now() - (parsed.timestamp || 0);
            if (cacheAge < 5 * 60 * 1000) {
              setListings(parsed.listings || []);
              setTotalListings(parsed.total || 0);
              setHasMore(parsed.hasMore || false);
              setListingsOffset(parsed.offset || 16);
              setLoading(false);
              return;
            }
          } catch (e) {
            // Якщо помилка парсингу, продовжуємо завантаження
          }
        }
      }
      
      // Завантажуємо свіжі дані з API
      const response = await fetch('/api/listings?limit=16&offset=0');
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings || []);
        setTotalListings(data.total || 0);
        setHasMore((data.listings?.length || 0) < (data.total || 0));
        setListingsOffset(16);
        
        // Зберігаємо в уніфікований кеш
        setCachedData('bazaarListingsState', {
          listings: data.listings || [],
          total: data.total || 0,
          hasMore: (data.listings?.length || 0) < (data.total || 0),
          offset: 16
        });
      } else {
        console.error('Failed to fetch listings:', response.status);
        setListings([]);
        showToast(t('common.loadingError'), 'error');
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
      setListings([]);
      showToast(t('common.loadingError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  // Завантажуємо оголошення з API (з кешуванням для швидкого відновлення)
  const hasLoadedListings = useRef(false);
  
  useEffect(() => {
    // Пропускаємо, якщо вже є дані в стані (не скидаємо при навігації)
    if (listings.length > 0 && hasLoadedListings.current) {
      return;
    }
    
    // Перевіряємо уніфікований кеш
    const cached = getCachedData('bazaarListingsState');
    if (cached && cached.listings && cached.listings.length > 0) {
      setListings(cached.listings || []);
      setTotalListings(cached.total || 0);
      setHasMore(cached.hasMore || false);
      setListingsOffset(cached.offset || 16);
      setLoading(false);
      hasLoadedListings.current = true;
      // Не завантажуємо з API, якщо є свіжий кеш
      return;
    }
    
    // Завантажуємо тільки один раз при монтуванні компонента, якщо немає кешу
    if (!hasLoadedListings.current) {
      hasLoadedListings.current = true;
      // Завантажуємо дані з API
      fetchListings(false);
    }
  }, [fetchListings]);


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
      localStorage.setItem(scrollPositionKey, '0');
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
      
      const nextOffset = listingsOffset + 16;
      const response = await fetch(`/api/listings?limit=16&offset=${listingsOffset}`);
      if (response.ok) {
        const data = await response.json();
        const newListings = [...listings, ...(data.listings || [])];
        setListings(newListings);
        const newOffset = listingsOffset + (data.listings?.length || 0);
        const newHasMore = newOffset < (data.total || 0);
        setHasMore(newHasMore);
        setListingsOffset(newOffset);
        tg?.HapticFeedback.impactOccurred('light');
        
        // Оновлюємо кеш з новими даними
        if (typeof window !== 'undefined') {
          localStorage.setItem('bazaarListingsState', JSON.stringify({
            listings: newListings,
            total: data.total || 0,
            hasMore: newHasMore,
            offset: newOffset,
            timestamp: Date.now()
          }));
        }
        
        if (nextOffset < (data.total || 0)) {
          fetch(`/api/listings?limit=16&offset=${nextOffset}`).catch(() => {});
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
  }, [loadingMore, hasMore, listingsOffset, listings, tg, showToast]);

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

    // Оновлюємо лічильник лайків на картці товару
    setListings(prev => prev.map(listing => 
      listing.id === id 
        ? { 
            ...listing, 
            favoritesCount: Math.max(0, (listing.favoritesCount || 0) + (isFavorite ? -1 : 1))
          }
        : listing
    ));

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

  // Зберігаємо позицію скролу та стан списку перед відкриттям деталей товару/профілю
  useEffect(() => {
    if (selectedListing || selectedSeller) {
      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      savedScrollPositionRef.current = currentScroll;
      
      // Зберігаємо в localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(scrollPositionKey, currentScroll.toString());
        
        // Зберігаємо поточний стан списку в localStorage для надійного збереження
        if (listings.length > 0) {
          localStorage.setItem('bazaarListingsState', JSON.stringify({
            listings: listings,
            total: totalListings,
            hasMore: hasMore,
            offset: listingsOffset,
            timestamp: Date.now()
          }));
        }
      }
      
      // НЕ скролимо до верху тут - це робить ListingDetail
      // Просто зберігаємо позицію
    }
  }, [selectedListing, selectedSeller, listings, totalListings, hasMore, listingsOffset]);
  
  // Окремий useEffect для відновлення позиції при закритті
  const shouldRestoreScroll = useRef(false);
  
  useEffect(() => {
    // Якщо щойно закрили оголошення або профіль
    const wasOpen = prevSelectedListing.current !== null;
    const isNowClosed = selectedListing === null;
    
    if (wasOpen && isNowClosed) {
      shouldRestoreScroll.current = true;
    }
    
    // Оновлюємо ref
    prevSelectedListing.current = selectedListing;
  }, [selectedListing]);
  
  // Відновлюємо позицію після рендеру, коли оголошення закрите
  useEffect(() => {
    // НЕ відновлюємо скрол, якщо щось відкрите
    if (selectedListing || selectedSeller) {
      return;
    }
    
    if (shouldRestoreScroll.current && selectedListing === null && selectedSeller === null) {
      shouldRestoreScroll.current = false;
      
      // Відновлюємо позицію скролу
      const savedPosition = savedScrollPositionRef.current > 0 
        ? savedScrollPositionRef.current 
        : (typeof window !== 'undefined' ? parseInt(localStorage.getItem(scrollPositionKey) || '0', 10) : 0);
      
      if (savedPosition > 0) {
        // Використовуємо кілька спроб для надійного відновлення
        const restoreScroll = () => {
          // Не відновлюємо скрол, якщо відкрите оголошення або профіль
          if (selectedListing || selectedSeller) {
            return;
          }
          
          if (typeof window !== 'undefined') {
            const currentScroll = window.scrollY || document.documentElement.scrollTop;
            // Відновлюємо тільки якщо позиція не така, яку ми хочемо
            if (Math.abs(currentScroll - savedPosition) > 10) {
              window.scrollTo({ top: savedPosition, behavior: 'auto' });
              document.documentElement.scrollTop = savedPosition;
              document.body.scrollTop = savedPosition;
            }
          }
        };
        
        // Відновлюємо після рендеру з кількома спробами, але з більшою затримкою
        // щоб дати час ListingDetail завершити свій скрол до верху
        const restoreAttempts = [500, 700, 1000, 1500, 2000];
        restoreAttempts.forEach((delay) => {
          setTimeout(() => {
            requestAnimationFrame(restoreScroll);
          }, delay);
        });
        
        savedScrollPositionRef.current = 0;
      }
    }
  }, [selectedListing, selectedSeller]);
  
  // Додаткова перевірка - якщо хтось скинув скролл на 0, відновлюємо позицію
  useEffect(() => {
    if (!selectedListing && !selectedSeller && !shouldRestoreScroll.current) {
      const savedPosition = typeof window !== 'undefined' 
        ? parseInt(localStorage.getItem(scrollPositionKey) || '0', 10) 
        : 0;
      
      if (savedPosition > 0) {
        const checkAndRestore = () => {
          // Не відновлюємо скрол, якщо відкрите оголошення або профіль
          if (selectedListing || selectedSeller) {
            return;
          }
          
          const currentScroll = window.scrollY || document.documentElement.scrollTop;
          // Якщо скролл на 0, але ми мали збережену позицію, відновлюємо
          if (currentScroll === 0 && savedPosition > 100) {
            window.scrollTo({ top: savedPosition, behavior: 'auto' });
            document.documentElement.scrollTop = savedPosition;
            document.body.scrollTop = savedPosition;
          }
        };
        
        // Перевіряємо через невеликі інтервали
        setTimeout(checkAndRestore, 200);
        setTimeout(checkAndRestore, 500);
      }
    }
  }, [selectedListing, selectedSeller]);
  
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
            // Зберігаємо позицію перед закриттям
            const currentScroll = window.scrollY || document.documentElement.scrollTop;
            if (currentScroll > 0) {
              savedScrollPositionRef.current = currentScroll;
              if (typeof window !== 'undefined') {
                localStorage.setItem(scrollPositionKey, currentScroll.toString());
              }
            }
            setSelectedSeller(null);
          }}
          onSelectListing={setSelectedListing}
          onToggleFavorite={toggleFavorite}
          favorites={favorites}
          tg={tg}
        />
      );
    }

    if (selectedListing) {
      return (
        <ListingDetail
          listing={selectedListing}
          isFavorite={favorites.has(selectedListing.id)}
          onClose={() => {
            // Встановлюємо прапорець, що користувач повертається з товару
            isReturningFromListing.current = true;
            hasScrolledOnThisMount.current = false;
            
            // Зберігаємо позицію перед закриттям (на випадок, якщо вона змінилася)
            const currentScroll = window.scrollY || document.documentElement.scrollTop;
            if (currentScroll > 0) {
              savedScrollPositionRef.current = currentScroll;
              if (typeof window !== 'undefined') {
                localStorage.setItem(scrollPositionKey, currentScroll.toString());
              }
            }
            setSelectedListing(null);
          }}
          onBack={() => {
            // Встановлюємо прапорець, що користувач повертається з товару
            isReturningFromListing.current = true;
            hasScrolledOnThisMount.current = false;
            
            // Зберігаємо позицію перед закриттям (на випадок, якщо вона змінилася)
            const currentScroll = window.scrollY || document.documentElement.scrollTop;
            if (currentScroll > 0) {
              savedScrollPositionRef.current = currentScroll;
              if (typeof window !== 'undefined') {
                localStorage.setItem(scrollPositionKey, currentScroll.toString());
              }
            }
            setSelectedListing(null);
          }}
          onToggleFavorite={toggleFavorite}
          onSelectListing={setSelectedListing}
          onViewSellerProfile={(telegramId, name, avatar, username, phone) => {
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
      return <ListingGridSkeleton count={6} />;
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
          // Зберігаємо ID оголошення перед відкриттям
          if (typeof window !== 'undefined') {
            localStorage.setItem(lastViewedListingIdKey, listing.id.toString());
          }
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
          // Зберігаємо telegramId при навігації
          let telegramId = new URLSearchParams(window.location.search).get('telegramId');
          
          // Якщо немає в URL, беремо з sessionStorage
          if (!telegramId) {
            telegramId = sessionStorage.getItem('telegramId');
          }
          
          const queryString = telegramId ? `?telegramId=${telegramId}` : '';
          const targetPath = tab === 'bazaar' ? 'bazaar' : tab === 'favorites' ? 'favorites' : tab === 'profile' ? 'profile' : 'categories';
          router.push(`/${lang}/${targetPath}${queryString}`);
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

