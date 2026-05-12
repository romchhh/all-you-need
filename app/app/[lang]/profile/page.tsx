'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useAutoPrefetch } from '@/hooks/usePrefetch';
import { Listing } from '@/types';
import { useTelegram } from '@/hooks/useTelegram';
import { ListingDetail } from '@/components/ListingDetail';
import { UserProfilePage } from '@/components/UserProfilePage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ProfileTab } from '@/components/tabs/ProfileTab';
import { Toast } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { getFavoritesFromStorage, addFavoriteToStorage, removeFavoriteFromStorage } from '@/utils/favorites';
import CreateListingFlow from '@/components/CreateListingFlow';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { AppHeader } from '@/components/AppHeader';

const ProfilePage = () => {
  const params = useParams();
  const pathname = usePathname();
  
  // Автоматичний prefetching для покращення UX
  useAutoPrefetch(pathname);
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { profile, refetch: refetchProfile, isBlocked, loading: profileLoading } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);

  if (isBlocked && !profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-white text-lg font-medium mb-2">⛔ {t('common.blocked')}</p>
        <p className="text-white/70 text-sm">{t('menu.support') || 'Підтримка'}</p>
      </div>
    );
  }

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
  
  useEffect(() => {
    if (profile?.telegramId && typeof window !== 'undefined') {
      (window as any).__userTelegramId = profile.telegramId;
    }
  }, [profile?.telegramId]);

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const savedScrollPositionRef = useRef<number>(0);
  const previousListingRef = useRef<Listing | null>(null); // Зберігаємо картку товару перед відкриттям профілю продавця
  const scrollPositionKey = 'profileScrollPosition';
  const lastViewedListingIdKey = 'profileLastViewedListingId';
  const isReturningFromListing = useRef(false);
  const hasScrolledOnThisMount = useRef(false);
  const didToggleFavoriteOnCurrentListing = useRef(false);
  
  // Завантажуємо обране з localStorage при завантаженні
  useEffect(() => {
    const favorites = getFavoritesFromStorage();
    setFavorites(favorites);
  }, []);

  const { tg } = useTelegram();
  const { toast, showToast, hideToast } = useToast();

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

  const toggleFavorite = async (id: number) => {
    const isFavorite = favorites.has(id);
    
    // Оптимістичне оновлення UI (обране + лічильник лайків на поточному оголошенні)
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (isFavorite) {
        newFavorites.delete(id);
      } else {
        newFavorites.add(id);
      }
      return newFavorites;
    });
    setSelectedListing(prev => {
      if (!prev || prev.id !== id) return prev;
      didToggleFavoriteOnCurrentListing.current = true;
      const delta = isFavorite ? -1 : 1;
      return { ...prev, favoritesCount: Math.max(0, (prev.favoritesCount ?? 0) + delta) };
    });

    tg?.HapticFeedback.notificationOccurred('success');
    
    // Виконуємо операцію (localStorage + БД для статистики, включно з власними оголошеннями)
    if (isFavorite) {
      await removeFavoriteFromStorage(id, profile?.telegramId);
      showToast(t('listing.removeFromFavorites'), 'success');
    } else {
      await addFavoriteToStorage(id, profile?.telegramId);
      showToast(t('listing.addToFavorites'), 'success');
    }
  };

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

  // Функція для скролу до останнього переглянутого оголошення
  const scrollToLastViewedListing = useCallback(() => {
    // Скролимо тільки якщо користувач повертається назад з товару
    if (!isReturningFromListing.current) {
      return;
    }
    
    if (typeof window === 'undefined' || selectedListing || selectedSeller) {
      return;
    }
    
    const lastViewedId = localStorage.getItem(lastViewedListingIdKey);
    if (!lastViewedId) {
      // Якщо немає ID, використовуємо збережену позицію скролу
      const savedPosition = localStorage.getItem(scrollPositionKey);
      if (savedPosition) {
        const position = parseInt(savedPosition, 10);
        if (!isNaN(position) && position > 0) {
          window.scrollTo({ top: position, behavior: 'auto' });
        }
      }
      isReturningFromListing.current = false;
      return;
    }
    
    const listingId = parseInt(lastViewedId, 10);
    if (isNaN(listingId)) {
      isReturningFromListing.current = false;
      return;
    }
    
    // Спробуємо знайти елемент кілька разів з різними затримками
    const tryScroll = (attempt: number = 0) => {
      const listingElement = document.querySelector(`[data-listing-id="${listingId}"]`) as HTMLElement;
      
      if (listingElement) {
        // Елемент знайдено - прокручуємо до нього
        listingElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        isReturningFromListing.current = false;
        return true;
      } else if (attempt < 10) {
        // Елемент не знайдено - спробуємо ще раз через деякий час
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
        isReturningFromListing.current = false;
        return false;
      }
    };
    
    // Починаємо спроби через невелику затримку, щоб DOM встиг відрендеритися
    setTimeout(() => tryScroll(), 300);
  }, [selectedListing, selectedSeller]);

  // Зберігаємо позицію скролу перед відкриттям деталей товару/профілю
  const prevListingIdRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (selectedListing || selectedSeller) {
      const currentListingId = selectedListing?.id || null;
      
      // Якщо це НОВЕ оголошення (змінився ID), очищаємо збережену позицію
      if (currentListingId !== null && prevListingIdRef.current !== null && currentListingId !== prevListingIdRef.current) {
        savedScrollPositionRef.current = 0;
      }
      
      // Зберігаємо позицію тільки якщо це перше відкриття або те саме оголошення
      if (prevListingIdRef.current === null || currentListingId === prevListingIdRef.current) {
        savedScrollPositionRef.current = window.scrollY || document.documentElement.scrollTop;
      }
      
      // Зберігаємо ID оголошення перед відкриттям
      if (selectedListing && typeof window !== 'undefined') {
        localStorage.setItem(lastViewedListingIdKey, selectedListing.id.toString());
      }
      
      // Оновлюємо ref
      prevListingIdRef.current = currentListingId;
      
      // НЕ скролимо до верху тут - це робить ListingDetail через key={listing.id}
    } else {
      // Якщо закрили - скидаємо ref
      prevListingIdRef.current = null;
      
      // Відновлюємо позицію скролу при закритті деталей
      if (isReturningFromListing.current && !hasScrolledOnThisMount.current) {
        hasScrolledOnThisMount.current = true;
        setTimeout(() => {
          scrollToLastViewedListing();
        }, 500);
      } else if (savedScrollPositionRef.current > 0) {
        const scrollPos = savedScrollPositionRef.current;
        setTimeout(() => {
          window.scrollTo({ top: scrollPos, behavior: 'smooth' });
          savedScrollPositionRef.current = 0;
        }, 150);
      }
    }
  }, [selectedListing, selectedSeller, scrollToLastViewedListing]);

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
            if (didToggleFavoriteOnCurrentListing.current) {
              setRefreshKey(prev => prev + 1);
              didToggleFavoriteOnCurrentListing.current = false;
            }
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
            if (didToggleFavoriteOnCurrentListing.current) {
              setRefreshKey(prev => prev + 1);
              didToggleFavoriteOnCurrentListing.current = false;
            }
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
      <ProfileTab 
        key={refreshKey} 
        tg={tg} 
        onSelectListing={(listing) => {
          // Зберігаємо ID оголошення перед відкриттям
          if (typeof window !== 'undefined') {
            localStorage.setItem(lastViewedListingIdKey, listing.id.toString());
          }
          setSelectedListing(listing);
        }} 
        onCreateListing={() => setIsCreateListingModalOpen(true)} 
        onEditModalChange={setIsEditModalOpen}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />
    );
  };

  // Відновлюємо позицію скролу при монтуванні ProfileTab (якщо повертаємося з товару)
  useEffect(() => {
    if (!selectedListing && !selectedSeller && isReturningFromListing.current && !hasScrolledOnThisMount.current) {
      hasScrolledOnThisMount.current = true;
      setTimeout(() => {
        scrollToLastViewedListing();
      }, 500);
    }
  }, [refreshKey, selectedListing, selectedSeller, scrollToLastViewedListing]);

  // Скидаємо прапорець при першому завантаженні сторінки
  useEffect(() => {
    // При першому завантаженні (коли немає selectedListing) скидаємо прапорець
    if (!selectedListing && !selectedSeller) {
      // Невелика затримка, щоб переконатися, що це не повернення з товару
      const timer = setTimeout(() => {
        if (!selectedListing && !selectedSeller) {
          isReturningFromListing.current = false;
          hasScrolledOnThisMount.current = false;
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = useCallback(async () => {
    try {
      // Оновлюємо профіль користувача
      await refetchProfile();
      // Оновлюємо ProfileTab через key
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [refetchProfile]);

  // Використовуємо pull-to-refresh (вимкнено при відкритих модалках)
  const { isPulling, pullDistance, pullProgress, isRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: false, // Вимкнено
    threshold: 120,
    tg
  });

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

      {!isEditModalOpen && (
      <BottomNavigation
        activeTab="profile"
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
      )}

      {profile && (
        <CreateListingFlow
          isOpen={isCreateListingModalOpen}
          onClose={() => setIsCreateListingModalOpen(false)}
          onSuccess={async () => {
            setIsCreateListingModalOpen(false);
            setRefreshKey(prev => prev + 1); // Оновлюємо ProfileTab
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

export default ProfilePage;

