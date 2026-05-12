'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useAutoPrefetch } from '@/hooks/usePrefetch';
import { Listing } from '@/types';
import { getCategories } from '@/constants/categories';
import { useTelegram } from '@/hooks/useTelegram';
import { ListingDetail } from '@/components/ListingDetail';
import { UserProfilePage } from '@/components/UserProfilePage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { CategoriesTab } from '@/components/tabs/CategoriesTab';
import { Toast } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { getFavoritesFromStorage, addFavoriteToStorage, removeFavoriteFromStorage } from '@/utils/favorites';
import { getCachedData, setCachedData, invalidateCache } from '@/utils/cache';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/hooks/useUser';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { AppHeader } from '@/components/AppHeader';

const CategoriesPage = () => {
  const params = useParams();
  const pathname = usePathname();
  
  // Автоматичний prefetching для покращення UX
  useAutoPrefetch(pathname);
  const router = useRouter();
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

  const categories = getCategories(t);

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
  
  useEffect(() => {
    if (lang === 'uk' || lang === 'ru') {
      setLanguage(lang);
    }
  }, [lang, setLanguage]);

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const previousListingRef = useRef<Listing | null>(null); // Зберігаємо картку товару перед відкриттям профілю продавця
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const savedScrollPositionRef = useRef<number>(0);
  const scrollPositionKey = 'categoriesScrollPosition';
  const lastViewedListingIdKey = 'categoriesLastViewedListingId';
  
  // Зберігаємо позицію скролу при скролі
  useEffect(() => {
    if (selectedListing || selectedSeller) return;
    
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (typeof window !== 'undefined') {
        localStorage.setItem(scrollPositionKey, scrollY.toString());
      }
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
  
  const [categoriesTabState, setCategoriesTabState] = useState<{
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    showFreeOnly: boolean;
  }>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('categoriesTabState');
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
      showFreeOnly: false,
    };
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('categoriesTabState', JSON.stringify(categoriesTabState));
    }
  }, [categoriesTabState]);

  // Завантажуємо обране з localStorage при завантаженні
  useEffect(() => {
    const favorites = getFavoritesFromStorage();
    setFavorites(favorites);
  }, []);

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [listingsOffset, setListingsOffset] = useState(16);
  const [totalListings, setTotalListings] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const { tg } = useTelegram();
  
  // Забезпечуємо розгортання вікна при завантаженні та запобігаємо згортанню
  useEffect(() => {
    if (tg && !selectedListing && !selectedSeller) {
      tg.expand();
      // Увімкнення підтвердження закриття для запобігання випадковому згортанню
      if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
      }
    }
    
    return () => {
      // Вимкнення підтвердження закриття при виході
      if (tg?.disableClosingConfirmation) {
        tg.disableClosingConfirmation();
      }
    };
  }, [tg, selectedListing, selectedSeller]);
  const { toast, showToast, hideToast } = useToast();
  
  // Відновлюємо скролл до останнього переглянутого оголошення при завантаженні сторінки
  const hasScrolledToListing = useRef(false);
  
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
  
  // Функція для відновлення скролу до оголошення
  const restoreScrollToListing = useCallback(() => {
    // Скролимо тільки якщо користувач повертається назад з товару
    if (!isReturningFromListing.current) {
      return;
    }
    
    if (typeof window === 'undefined' || selectedListing || selectedSeller || listings.length === 0 || hasScrolledToListing.current) {
      return;
    }
      
      const lastViewedId = localStorage.getItem(lastViewedListingIdKey);
      if (lastViewedId) {
        const listingId = parseInt(lastViewedId, 10);
        
      // Використовуємо кілька спроб для надійного відновлення
      const scrollToListing = () => {
          const listingElement = document.querySelector(`[data-listing-id="${listingId}"]`);
          if (listingElement) {
            hasScrolledToListing.current = true;
            // Прокручуємо до елемента з невеликим відступом зверху
            const elementTop = listingElement.getBoundingClientRect().top + window.scrollY;
            const offset = 100;
          window.scrollTo({ top: elementTop - offset, behavior: 'auto' });
          document.documentElement.scrollTop = elementTop - offset;
          document.body.scrollTop = elementTop - offset;
          return true;
        }
        return false;
      };
      
      // Спробуємо відразу
      if (scrollToListing()) {
        // Скидаємо прапорець після успішного скролу
        isReturningFromListing.current = false;
        return;
      }
      
      // Якщо не вийшло, спробуємо через різні затримки
      const attempts = [50, 100, 200, 300, 500, 800, 1200];
      attempts.forEach((delay) => {
        setTimeout(() => {
          if (!hasScrolledToListing.current) {
            if (scrollToListing()) {
              // Скидаємо прапорець після успішного скролу
              isReturningFromListing.current = false;
              return;
            }
            // Якщо елемент все ще не знайдено, використовуємо збережену позицію скролу
            if (delay === attempts[attempts.length - 1]) {
            const savedPosition = localStorage.getItem(scrollPositionKey);
            if (savedPosition) {
              const position = parseInt(savedPosition, 10);
              if (!isNaN(position) && position > 0) {
                window.scrollTo({ top: position, behavior: 'auto' });
                  document.documentElement.scrollTop = position;
                  document.body.scrollTop = position;
                }
              }
              // Скидаємо прапорець навіть якщо не знайшли елемент
              isReturningFromListing.current = false;
            }
          }
        }, delay);
      });
    } else {
      // Якщо немає збереженого ID, використовуємо збережену позицію скролу
      const savedPosition = localStorage.getItem(scrollPositionKey);
      if (savedPosition) {
        const position = parseInt(savedPosition, 10);
        if (!isNaN(position) && position > 0) {
          setTimeout(() => {
            window.scrollTo({ top: position, behavior: 'auto' });
            document.documentElement.scrollTop = position;
            document.body.scrollTop = position;
          }, 100);
        }
      }
    }
  }, [selectedListing, selectedSeller, listings]);
  
  // Відновлюємо скрол при закритті оголошення або при завантаженні listings
  useEffect(() => {
    // НЕ відновлюємо скрол до оголошення, якщо щось відкрите
    if (selectedListing || selectedSeller) {
      return;
    }
    
    // Скролимо тільки якщо користувач повертається назад з товару
    if (isReturningFromListing.current && !selectedListing && !selectedSeller && listings.length > 0 && !hasScrolledToListing.current) {
      restoreScrollToListing();
    }
  }, [selectedListing, selectedSeller, listings, restoreScrollToListing]);

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

  const hasLoadedCategoriesListings = useRef(false);
  useEffect(() => {
    const fetchListings = async (forceRefresh: boolean = false) => {
      try {
        setLoading(true);
        const cacheKey = 'listings:all';
        
        // Перевіряємо кеш тільки якщо не примусове оновлення
        if (!forceRefresh) {
          const cached = getCachedData(cacheKey);
          if (cached && cached.listings) {
            setListings(cached.listings || []);
            setTotalListings(cached.total || 0);
            setHasMore((cached.listings?.length || 0) < (cached.total || 0));
            setListingsOffset(cached.offset || 16);
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
          // Використовуємо уніфікований кеш
          setCachedData(cacheKey, {
            listings: data.listings || [],
            total: data.total || 0,
            offset: 16,
            hasMore: (data.listings?.length || 0) < (data.total || 0)
          });
        } else {
          setListings([]);
        }
      } catch (error) {
        console.error('Error fetching listings:', error);
        setListings([]);
      } finally {
        setLoading(false);
      }
    };

    // Завантажуємо тільки один раз при монтуванні
    if (!hasLoadedCategoriesListings.current) {
      hasLoadedCategoriesListings.current = true;
      fetchListings(false);
    }
  }, []);

  // Infinite scroll для categories
  const loadMoreListings = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      
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
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, listingsOffset, listings, tg]);

  useEffect(() => {
    const handleScroll = () => {
      if (loadingMore || !hasMore || selectedListing || selectedSeller) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      if (scrollTop + windowHeight >= documentHeight - 300) {
        loadMoreListings();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, loadMoreListings, selectedListing, selectedSeller]);

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

  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = useCallback(async () => {
    // Очищаємо кеш при оновленні
    if (typeof window !== 'undefined') {
      invalidateCache('listings:all');
    }
    
    // Перезавантажуємо дані
    try {
      setLoading(true);
      const response = await fetch('/api/listings?limit=16&offset=0');
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings || []);
        setTotalListings(data.total || 0);
        setHasMore((data.listings?.length || 0) < (data.total || 0));
        setListingsOffset(16);
        // Оновлюємо кеш
        setCachedData('listings:all', {
          listings: data.listings || [],
          total: data.total || 0,
          offset: 16,
          hasMore: (data.listings?.length || 0) < (data.total || 0)
        });
      }
    } catch (error) {
      console.error('Error refreshing categories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Використовуємо pull-to-refresh
  const { isPulling, pullDistance, pullProgress, isRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: false, // Вимкнено
    threshold: 120,
    tg
  });

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
  const prevListingIdRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (selectedListing || selectedSeller) {
      const currentListingId = selectedListing?.id || null;
      
      // Якщо це НОВЕ оголошення (змінився ID), очищаємо збережену позицію
      if (currentListingId !== null && prevListingIdRef.current !== null && currentListingId !== prevListingIdRef.current) {
        savedScrollPositionRef.current = 0;
        if (typeof window !== 'undefined') {
          localStorage.setItem(scrollPositionKey, '0');
        }
      }
      
      // Зберігаємо позицію тільки якщо це перше відкриття або те саме оголошення
      if (prevListingIdRef.current === null || currentListingId === prevListingIdRef.current) {
        const currentScroll = window.scrollY || document.documentElement.scrollTop;
        savedScrollPositionRef.current = currentScroll;
        
        // Зберігаємо в localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(scrollPositionKey, currentScroll.toString());
        }
      }
      
      // Оновлюємо ref
      prevListingIdRef.current = currentListingId;
      
      // НЕ скролимо до верху тут - це робить ListingDetail
      // Просто зберігаємо позицію
    } else {
      // Якщо закрили - скидаємо ref
      prevListingIdRef.current = null;
    }
  }, [selectedListing, selectedSeller]);
  
  // Окремий useEffect для відновлення позиції при закритті
  const prevSelectedListing = useRef<Listing | null>(null);
  const prevSelectedSeller = useRef<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const shouldRestoreScroll = useRef(false);
  
  useEffect(() => {
    // Якщо щойно закрили оголошення або профіль
    const wasOpen = (prevSelectedListing.current !== null || prevSelectedSeller.current !== null);
    const isNowClosed = (selectedListing === null && selectedSeller === null);
    
    if (wasOpen && isNowClosed) {
      shouldRestoreScroll.current = true;
      // Скидаємо прапорець для відновлення скролу до оголошення
      hasScrolledToListing.current = false;
    }
    
    // Оновлюємо refs
    prevSelectedListing.current = selectedListing;
    prevSelectedSeller.current = selectedSeller;
  }, [selectedListing, selectedSeller]);
  
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
          if (delay === 0) {
            requestAnimationFrame(() => {
              requestAnimationFrame(restoreScroll);
            });
          } else {
        setTimeout(() => {
              requestAnimationFrame(restoreScroll);
            }, delay);
          }
        });
        
          savedScrollPositionRef.current = 0;
      }
    }
  }, [selectedListing, selectedSeller]);
  
  // ВИДАЛЕНО: Додаткова перевірка, яка відновлювала скрол навіть при відкритті нового оголошення
  // Тепер відновлення скролу відбувається тільки при закритті через shouldRestoreScroll

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
          key={selectedListing.id}
          listing={selectedListing}
          isFavorite={favorites.has(selectedListing.id)}
          onClose={() => {
            // Встановлюємо прапорець, що користувач повертається з товару
            isReturningFromListing.current = true;
            hasScrolledToListing.current = false;
            
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
          onAutoRenewPersist={(id, autoRenew) =>
            setSelectedListing((prev) => (prev && prev.id === id ? { ...prev, autoRenew } : prev))
          }
        />
      );
    }

    return (
      <CategoriesTab
        categories={categories}
        listings={listings}
        favorites={favorites}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMoreListings}
        onSelectListing={(listing) => {
          // Зберігаємо ID оголошення перед відкриттям
          if (typeof window !== 'undefined') {
            localStorage.setItem(lastViewedListingIdKey, listing.id.toString());
          }
          setSelectedListing(listing);
        }}
        onToggleFavorite={toggleFavorite}
        savedState={categoriesTabState}
        onStateChange={setCategoriesTabState}
        tg={tg}
      />
    );
  };

  return (
    <div className="min-h-screen pb-20 overflow-x-hidden max-w-full">
      <AppHeader />
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
                      stroke="url(#gradient-profile)" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${56.5 * pullProgress} ${56.5 * (1 - pullProgress)}`}
                      className="transition-all duration-200"
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                    <defs>
                      <linearGradient id="gradient-profile" x1="0%" y1="0%" x2="100%" y2="100%">
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
      <div className="mx-auto w-full max-w-2xl overflow-x-hidden lg:max-w-5xl xl:max-w-6xl">
        {renderContent()}
      </div>

      <BottomNavigation
        activeTab="categories"
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
        favoritesCount={favorites.size}
        tg={tg}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

export default CategoriesPage;

