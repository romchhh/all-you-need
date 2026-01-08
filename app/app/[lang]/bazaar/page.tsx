'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { getFavoritesFromStorage, saveFavoritesToStorage } from '@/utils/favorites';
import { ListingGridSkeleton } from '@/components/SkeletonLoader';
import { getCachedData, setCachedData, invalidateCache } from '@/utils/cache';
import { CreateListingModal } from '@/components/CreateListingModal';
import { CategoriesModal } from '@/components/CategoriesModal';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

const BazaarPage = () => {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { profile } = useUser();
  
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

  const [searchQuery, setSearchQuery] = useState(() => {
    // Завантажуємо збережений пошуковий запит з localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarSearchQuery');
      return saved || '';
    }
    return '';
  });
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
    const savedFavorites = getFavoritesFromStorage();
    setFavorites(savedFavorites);
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
      
      const cacheKey = 'listings:0:16';
      
      // Перевіряємо кеш тільки якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey);
        if (cached) {
          setListings(cached.listings || []);
          setTotalListings(cached.total || 0);
          setHasMore((cached.listings?.length || 0) < (cached.total || 0));
          setListingsOffset(16);
          setLoading(false);
          return;
        }
      }
      
      const response = await fetch('/api/listings?limit=16&offset=0');
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings || []);
        setTotalListings(data.total || 0);
        setHasMore((data.listings?.length || 0) < (data.total || 0));
        setListingsOffset(16);
        
        // Зберігаємо в кеш
        setCachedData(cacheKey, data);
        
        // Також зберігаємо всі listings для швидкого відновлення
        if (typeof window !== 'undefined') {
          localStorage.setItem('bazaarListings', JSON.stringify({
            listings: data.listings || [],
            total: data.total || 0,
            timestamp: Date.now()
          }));
          localStorage.setItem('bazaarListingsOffset', '16');
        }
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
  }, [showToast]);

  // Завантажуємо оголошення з API з кешуванням (тільки при першому завантаженні)
  const hasLoadedListings = useRef(false);
  
  useEffect(() => {
    // Завантажуємо тільки один раз при монтуванні компонента
    if (!hasLoadedListings.current) {
      hasLoadedListings.current = true;
      
      // Спочатку перевіряємо localStorage для швидкого відновлення
      if (typeof window !== 'undefined') {
        const savedListings = localStorage.getItem('bazaarListings');
        const savedOffset = localStorage.getItem('bazaarListingsOffset');
        if (savedListings) {
          try {
            const parsed = JSON.parse(savedListings);
            const now = Date.now();
            // Якщо дані не старіші за 30 хвилин, використовуємо їх
            if (now - parsed.timestamp < 30 * 60 * 1000) {
              setListings(parsed.listings || []);
              setTotalListings(parsed.total || 0);
              const offset = savedOffset ? parseInt(savedOffset, 10) : (parsed.listings?.length || 16);
              setHasMore(offset < (parsed.total || 0));
              setListingsOffset(offset);
              setLoading(false);
              
              // НЕ завантажуємо оновлені дані в фоні, щоб уникнути скидання стану
              // Користувач може вручну оновити через pull-to-refresh
              return;
            }
          } catch (e) {
            // ignore
          }
        }
      }
      
      fetchListings(false);
    }
  }, [fetchListings]);

  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = async () => {
    // Очищаємо весь кеш при оновленні
    if (typeof window !== 'undefined' && window.localStorage) {
      // Очищаємо кеш listings
      const cacheKey = 'listings:0:16';
      localStorage.removeItem(`cache_${cacheKey}`);
      localStorage.removeItem('bazaarListings');
      localStorage.removeItem('bazaarListingsOffset');
      
      // Очищаємо всі кеші listings
      invalidateCache('listings');
    }
    
    // Примусово оновлюємо дані
    await fetchListings(true);
    
    // Скидаємо позицію скролу після оновлення
    if (typeof window !== 'undefined') {
      localStorage.setItem(scrollPositionKey, '0');
    }
  };

  const { isPulling, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: false,
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
        setHasMore(newOffset < (data.total || 0));
        setListingsOffset(newOffset);
        tg?.HapticFeedback.impactOccurred('light');
        
        // Зберігаємо оновлений список в localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('bazaarListings', JSON.stringify({
            listings: newListings,
            total: data.total || 0,
            timestamp: Date.now()
          }));
          localStorage.setItem('bazaarListingsOffset', newOffset.toString());
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

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(id)) {
        newFavorites.delete(id);
        saveFavoritesToStorage(newFavorites);
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('listing.removeFromFavorites'), 'success');
      } else {
        newFavorites.add(id);
        saveFavoritesToStorage(newFavorites);
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('listing.addToFavorites'), 'success');
      }
      return newFavorites;
    });
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

  // Зберігаємо позицію скролу перед відкриттям деталей товару/профілю
  useEffect(() => {
    if (selectedListing || selectedSeller) {
      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      savedScrollPositionRef.current = currentScroll;
      
      // Зберігаємо в localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(scrollPositionKey, currentScroll.toString());
      }
      
      // НЕ скролимо до верху тут - це робить ListingDetail
      // Просто зберігаємо позицію
    }
  }, [selectedListing, selectedSeller]);
  
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
    <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden max-w-full">
      {isPulling && (
        <div 
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-50 bg-white/90 backdrop-blur-sm transition-opacity"
          style={{
            height: `${Math.min(pullDistance, 80)}px`,
            opacity: Math.min(pullProgress * 1.5, 1),
            transform: `translateY(${Math.min(pullDistance - 80, 0)}px)`
          }}
        >
          {pullProgress >= 1 ? (
            <div className="flex items-center gap-2 text-blue-500">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium">{t('common.loading')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full" style={{
                transform: `rotate(${pullProgress * 360}deg)`
              }}></div>
              <span className="text-sm">{t('common.pullToRefresh')}</span>
            </div>
          )}
        </div>
      )}
      <div className="max-w-2xl mx-auto w-full overflow-x-hidden">
        {renderContent()}
      </div>

      <BottomNavigation
        activeTab="bazaar"
        onTabChange={(tab) => {
          router.push(`/${lang}/${tab === 'bazaar' ? 'bazaar' : tab === 'favorites' ? 'favorites' : tab === 'profile' ? 'profile' : 'categories'}`);
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
        <CreateListingModal
          isOpen={isCreateListingModalOpen}
          onClose={() => setIsCreateListingModalOpen(false)}
          onSave={async (listingData) => {
            const formData = new FormData();
            formData.append('title', listingData.title);
            formData.append('description', listingData.description);
            formData.append('price', listingData.price);
            formData.append('currency', listingData.currency || 'UAH');
            formData.append('isFree', listingData.isFree.toString());
            formData.append('category', listingData.category);
            if (listingData.subcategory) {
              formData.append('subcategory', listingData.subcategory);
            }
            formData.append('location', listingData.location);
            formData.append('condition', listingData.condition);
            formData.append('telegramId', profile.telegramId);
            
            listingData.images.forEach((image: File) => {
              formData.append('images', image);
            });

            const response = await fetch('/api/listings/create', {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error('Failed to create listing');
            }

            await fetchListings();
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

