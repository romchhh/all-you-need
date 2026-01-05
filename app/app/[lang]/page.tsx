'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Listing } from '@/types';
import { getCategories } from '@/constants/categories';
import { useTelegram } from '@/hooks/useTelegram';
import { ListingDetail } from '@/components/ListingDetail';
import { UserProfilePage } from '@/components/UserProfilePage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { BazaarTab } from '@/components/tabs/BazaarTab';
import { CategoriesTab } from '@/components/tabs/CategoriesTab';
import { FavoritesTab } from '@/components/tabs/FavoritesTab';
import { ProfileTab } from '@/components/tabs/ProfileTab';
import { Toast } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { getFavoritesFromStorage, saveFavoritesToStorage } from '@/utils/favorites';
import { ListingGridSkeleton } from '@/components/SkeletonLoader';
import { getCachedData, setCachedData } from '@/utils/cache';
import { CreateListingModal } from '@/components/CreateListingModal';
import { CategoriesModal } from '@/components/CategoriesModal';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

const AYNMarketplace = () => {
  const params = useParams();
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
      // Оновлюємо LanguageContext з telegramId через глобальну змінну або інший механізм
      // Для простоти, LanguageContext сам завантажить мову при зміні userTelegramId
      (window as any).__userTelegramId = profile.telegramId;
    }
  }, [profile?.telegramId]);

  const [activeTab, setActiveTab] = useState('bazaar');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [selectedCategoryFromModal, setSelectedCategoryFromModal] = useState<string | null>(null);
  const savedScrollPositionRef = useRef<number>(0);

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
              // Зберігаємо позицію скролу перед відкриттям
              savedScrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
              setSelectedListing(data);
            }
          })
          .catch(err => console.error('Error fetching listing:', err));
      }
    } else if (userParam) {
      const telegramId = userParam;
      if (!selectedSeller || selectedSeller.telegramId !== telegramId) {
        // Завантажуємо дані профілю
        fetch(`/api/user/profile?telegramId=${telegramId}`)
          .then(res => res.json())
          .then(data => {
            if (data.telegramId) {
              // Зберігаємо позицію скролу перед відкриттям
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
  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Перевіряємо кеш
      const cacheKey = 'listings:0:16';
      const cached = getCachedData(cacheKey);
      if (cached) {
        setListings(cached.listings || []);
        setTotalListings(cached.total || 0);
        setHasMore((cached.listings?.length || 0) < (cached.total || 0));
        setListingsOffset(16);
        setLoading(false);
        return;
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
      } else {
        console.error('Failed to fetch listings:', response.status);
        setListings([]);
        showToast('Помилка завантаження товарів', 'error');
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
      setListings([]);
      showToast('Помилка завантаження товарів', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Завантажуємо оголошення з API з кешуванням
  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Функція для оновлення даних (pull-to-refresh)
  const handleRefresh = async () => {
    // Очищаємо кеш для оновлення даних
    if (typeof window !== 'undefined' && window.localStorage) {
      const cacheKey = 'listings:0:16';
      localStorage.removeItem(`cache_${cacheKey}`);
    }
    await fetchListings();
  };

  // Додаємо pull-to-refresh тільки на головній вкладці
  const { isPulling, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: activeTab === 'bazaar' && !selectedListing && !selectedSeller,
    tg
  });

  const [loadingMore, setLoadingMore] = useState(false);

  const loadMoreListings = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      
      // Prefetching: завантажуємо наступну сторінку заздалегідь
      const nextOffset = listingsOffset + 16;
      const response = await fetch(`/api/listings?limit=16&offset=${listingsOffset}`);
      if (response.ok) {
        const data = await response.json();
        setListings(prev => [...prev, ...(data.listings || [])]);
        setHasMore((listingsOffset + (data.listings?.length || 0)) < (data.total || 0));
        setListingsOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
        
        // Prefetch наступної сторінки в фоні
        if (nextOffset < (data.total || 0)) {
          fetch(`/api/listings?limit=16&offset=${nextOffset}`).catch(() => {});
        }
      } else {
        showToast('Помилка завантаження товарів', 'error');
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
      showToast('Помилка завантаження товарів', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, listingsOffset, tg, showToast]);

  // Infinite scroll
  useEffect(() => {
    if (activeTab !== 'bazaar') return;
    
    const handleScroll = () => {
      if (loadingMore || !hasMore) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Завантажуємо більше, коли користувач на 300px від низу
      if (scrollTop + windowHeight >= documentHeight - 300) {
        loadMoreListings();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, activeTab, loadMoreListings]);

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(id)) {
        newFavorites.delete(id);
        saveFavoritesToStorage(newFavorites);
        tg?.HapticFeedback.notificationOccurred('success');
        showToast('Видалено з обраного', 'info');
      } else {
        newFavorites.add(id);
        saveFavoritesToStorage(newFavorites);
        tg?.HapticFeedback.notificationOccurred('success');
        showToast('Додано в обране', 'success');
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

  // Скролимо нагору при зміні вкладки
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // Зберігаємо позицію скролу перед відкриттям деталей товару/профілю
  useEffect(() => {
    if (selectedListing || selectedSeller) {
      // Зберігаємо поточну позицію скролу перед відкриттям
      savedScrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
      
      // Функція для скролу нагору
      const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };

      // Миттєво скролимо нагору
      scrollToTop();

      // Використовуємо requestAnimationFrame для гарантії після рендерингу
      requestAnimationFrame(() => {
        scrollToTop();
        requestAnimationFrame(() => {
          scrollToTop();
          // Додаткова перевірка через невелику затримку
          setTimeout(() => {
            scrollToTop();
          }, 100);
        });
      });
    } else {
      // Відновлюємо позицію скролу при закритті
      if (savedScrollPositionRef.current > 0) {
        // Використовуємо setTimeout, щоб дати час DOM оновитися
        const scrollPos = savedScrollPositionRef.current;
        setTimeout(() => {
          window.scrollTo({ top: scrollPos, behavior: 'smooth' });
          // Скидаємо збережену позицію після відновлення
          savedScrollPositionRef.current = 0;
        }, 150);
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
          onClose={() => setSelectedListing(null)}
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

    switch (activeTab) {
      case 'bazaar':
        if (loading) {
          return <ListingGridSkeleton count={6} />;
        }
        return (
          <BazaarTab
            categories={categories}
            listings={listings}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            favorites={favorites}
            onSelectListing={setSelectedListing}
            onToggleFavorite={toggleFavorite}
            onCreateListing={() => setIsCreateListingModalOpen(true)}
            hasMore={hasMore}
            onLoadMore={loadMoreListings}
            onNavigateToCategories={() => setActiveTab('categories')}
            onOpenCategoriesModal={() => setIsCategoriesModalOpen(true)}
            initialSelectedCategory={selectedCategoryFromModal}
            tg={tg}
          />
        );

      case 'categories':
        return (
          <CategoriesTab
            categories={categories}
            listings={listings}
            favorites={favorites}
            onSelectListing={setSelectedListing}
            onToggleFavorite={toggleFavorite}
            tg={tg}
          />
        );

      case 'favorites':
        return (
          <FavoritesTab
            listings={listings}
            favorites={favorites}
            onSelectListing={setSelectedListing}
            onToggleFavorite={toggleFavorite}
            onNavigateToCatalog={() => setActiveTab('bazaar')}
            tg={tg}
          />
        );

      case 'profile':
        return <ProfileTab tg={tg} onSelectListing={setSelectedListing} />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden max-w-full">
      {/* Індикатор pull-to-refresh */}
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

            {/* Нижнє меню завжди зафіксоване знизу */}
            <BottomNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onCloseDetail={() => {
                setSelectedListing(null);
                setSelectedSeller(null);
              }}
              onCreateListing={() => setIsCreateListingModalOpen(true)}
              favoritesCount={favorites.size}
              tg={tg}
            />

      {/* Модальне вікно категорій */}
      <CategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        onSelectCategory={(categoryId) => {
          setSelectedCategoryFromModal(categoryId);
        }}
        tg={tg}
      />

      {/* Модальне вікно створення оголошення */}
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

            // Оновлюємо список оголошень
            await fetchListings();
            setIsCreateListingModalOpen(false);
            showToast('Оголошення успішно створено!', 'success');
          }}
          tg={tg}
        />
      )}

      {/* Toast сповіщення */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

export default AYNMarketplace;
