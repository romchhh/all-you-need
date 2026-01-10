'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useAutoPrefetch } from '@/hooks/usePrefetch';
import { Listing } from '@/types';
import { useTelegram } from '@/hooks/useTelegram';
import { ListingDetail } from '@/components/ListingDetail';
import { UserProfilePage } from '@/components/UserProfilePage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { FavoritesTab } from '@/components/tabs/FavoritesTab';
import { Toast } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { getFavoritesFromStorage, addFavoriteToStorage, removeFavoriteFromStorage } from '@/utils/favorites';
import { getCachedData, setCachedData } from '@/utils/cache';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { CreateListingModal } from '@/components/CreateListingModal';
import { useUser } from '@/hooks/useUser';

const FavoritesPage = () => {
  const params = useParams();
  const pathname = usePathname();
  
  // Автоматичний prefetching для покращення UX
  useAutoPrefetch(pathname);
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { profile } = useUser();
  const { tg } = useTelegram();
  const { toast, showToast, hideToast } = useToast();
  
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
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const savedScrollPositionRef = useRef<number>(0);
  const scrollPositionKey = 'favoritesScrollPosition';
  const lastViewedListingIdKey = 'favoritesLastViewedListingId';
  
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
  
  // Завантажуємо обране з localStorage та товари
  useEffect(() => {
    const loadFavoritesAndListings = async () => {
      // Діагностика
      console.log('[Favorites] Starting to load favorites and listings');
      console.log('[Favorites] window type:', typeof window);
      
      // Спочатку завантажуємо favorites з localStorage
      const loadedFavorites = getFavoritesFromStorage();
      console.log('[Favorites] Loaded from localStorage:', Array.from(loadedFavorites));
      setFavorites(loadedFavorites);
      
      // Якщо немає обраних - показуємо порожній стан
      if (loadedFavorites.size === 0) {
        console.log('[Favorites] No favorites found, showing empty state');
        setListings([]);
        setLoading(false);
        return;
      }

      // Завантажуємо товари для обраних ID
      try {
        setLoading(true);
        const favoriteIds = Array.from(loadedFavorites);
        console.log('[Favorites] Fetching listings for IDs:', favoriteIds);
        
        // Завантажуємо кожен товар окремо
        const promises = favoriteIds.map(id => 
          fetch(`/api/listings/${id}`)
            .then(res => {
              console.log(`[Favorites] Response for listing ${id}:`, res.ok, res.status);
              return res.ok ? res.json() : null;
            })
            .catch(error => {
              console.error(`[Favorites] Error fetching listing ${id}:`, error);
              return null;
            })
        );
        
        const results = await Promise.all(promises);
        const validListings = results.filter((listing): listing is Listing => 
          listing !== null && listing.id
        );
        
        console.log('[Favorites] Valid listings loaded:', validListings.length);
        
        // Сортуємо по даті створення (новіші спочатку)
        validListings.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        
        setListings(validListings);
      } catch (error) {
        console.error('[Favorites] Error fetching favorite listings:', error);
        setListings([]);
      } finally {
        setLoading(false);
      }
    };

    loadFavoritesAndListings();
  }, []);
  
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

  // Завантажуємо товари з обраного при зміні favorites
  useEffect(() => {
    const fetchFavoriteListings = async () => {
      if (favorites.size === 0) {
        setListings([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const favoriteIds = Array.from(favorites);
        
        // Завантажуємо кожен товар окремо
        const promises = favoriteIds.map(id => 
          fetch(`/api/listings/${id}`)
            .then(res => res.ok ? res.json() : null)
            .catch(() => null)
        );
        
        const results = await Promise.all(promises);
        const validListings = results.filter((listing): listing is Listing => 
          listing !== null && listing.id
        );
        
        // Сортуємо по даті створення (новіші спочатку)
        validListings.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        
        setListings(validListings);
      } catch (error) {
        console.error('Error fetching favorite listings:', error);
        setListings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFavoriteListings();
  }, [favorites.size]);

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

    tg?.HapticFeedback.notificationOccurred('success');
    
    // Виконуємо операцію (localStorage + БД для статистики)
    if (isFavorite) {
      await removeFavoriteFromStorage(id, profile?.telegramId);
      // Видаляємо зі списку listings
      setListings(prev => prev.filter(listing => listing.id !== id));
      showToast(t('listing.removeFromFavorites'), 'success');
    } else {
      await addFavoriteToStorage(id, profile?.telegramId);
      showToast(t('listing.addToFavorites'), 'success');
      
      // Завантажуємо деталі товару і додаємо до списку, якщо його там немає
      const existingListing = listings.find(l => l.id === id);
      if (!existingListing) {
        try {
          const response = await fetch(`/api/listings/${id}`);
          if (response.ok) {
            const listingData = await response.json();
            if (listingData.id) {
              // Додаємо товар на початок списку
              setListings(prev => [listingData, ...prev]);
            }
          }
        } catch (error) {
          console.error('Error fetching listing details:', error);
        }
      }
    }
  };

  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = useCallback(async () => {
    // Очищаємо кеш при оновленні
    if (typeof window !== 'undefined' && window.localStorage) {
      const cacheKey = 'listings:all';
      localStorage.removeItem(`cache_${cacheKey}`);
    }
    
    // Перезавантажуємо дані
    try {
      setLoading(true);
      
      // Оновлюємо favorites з localStorage
      const updatedFavorites = getFavoritesFromStorage();
      setFavorites(updatedFavorites);
      
      // Завантажуємо listings і фільтруємо тільки обрані
      const response = await fetch('/api/listings?limit=1000&offset=0');
      if (response.ok) {
        const data = await response.json();
        const favoriteIds = Array.from(updatedFavorites);
        const favoriteListings = (data.listings || []).filter((listing: Listing) => 
          favoriteIds.includes(listing.id)
        );
        setListings(favoriteListings);
      }
    } catch (error) {
      console.error('Error refreshing favorites:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Використовуємо pull-to-refresh для запобігання згортанню додатку
  const { isPulling, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: !selectedListing && !selectedSeller,
    tg
  });

  // Забезпечуємо розгортання вікна при завантаженні
  useEffect(() => {
    if (tg && !selectedListing && !selectedSeller) {
      tg.expand();
    }
  }, [tg, selectedListing, selectedSeller]);

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
  const prevSelectedListing = useRef<Listing | null>(null);
  const prevSelectedSeller = useRef<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const shouldRestoreScroll = useRef(false);
  
  useEffect(() => {
    // Якщо щойно закрили оголошення або профіль
    const wasOpen = (prevSelectedListing.current !== null || prevSelectedSeller.current !== null);
    const isNowClosed = (selectedListing === null && selectedSeller === null);
    
    if (wasOpen && isNowClosed) {
      shouldRestoreScroll.current = true;
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

  const renderContent = () => {
    if (selectedSeller) {
      return (
        <UserProfilePage
          sellerTelegramId={selectedSeller.telegramId}
          sellerName={selectedSeller.name}
          sellerAvatar={selectedSeller.avatar}
          sellerUsername={selectedSeller.username}
          sellerPhone={selectedSeller.phone}
          onClose={() => setSelectedSeller(null)}
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
            hasScrolledToListing.current = false;
            
            savedScrollPositionRef.current = window.scrollY || document.documentElement.scrollTop;
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

    return (
      <FavoritesTab
        listings={listings}
        favorites={favorites}
        onSelectListing={(listing) => {
          // Зберігаємо ID оголошення перед відкриттям
          if (typeof window !== 'undefined') {
            localStorage.setItem(lastViewedListingIdKey, listing.id.toString());
          }
          setSelectedListing(listing);
        }}
        onToggleFavorite={toggleFavorite}
        onNavigateToCatalog={() => router.push(`/${lang}/bazaar`)}
        tg={tg}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden max-w-full">
      <div className="max-w-2xl mx-auto w-full overflow-x-hidden">
        {renderContent()}
      </div>

      <BottomNavigation
        activeTab="favorites"
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

      {profile && (
        <CreateListingModal
          isOpen={isCreateListingModalOpen}
          onClose={() => setIsCreateListingModalOpen(false)}
          onSave={async (listingData) => {
            // Після створення товару оновлюємо список favorites
            await handleRefresh();
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

export default FavoritesPage;

