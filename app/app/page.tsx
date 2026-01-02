'use client';

import { useState, useEffect, useCallback } from 'react';
import { Listing } from '@/types';
import { categories } from '@/constants/categories';
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
import { ListingPreviewModal } from '@/components/ListingPreviewModal';

const AYNMarketplace = () => {
  const [activeTab, setActiveTab] = useState('bazaar');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [previewListing, setPreviewListing] = useState<Listing | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<{ telegramId: string; name: string; avatar: string; username?: string; phone?: string } | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

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
              setSelectedListing(data);
              // Скролимо нагору
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }, 100);
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
              setSelectedSeller({
                telegramId: data.telegramId.toString(),
                name: data.firstName && data.lastName 
                  ? `${data.firstName} ${data.lastName}`.trim()
                  : data.username || 'Користувач',
                avatar: data.avatar || '👤',
                username: data.username || undefined,
                phone: data.phone || undefined
              });
              // Скролимо нагору
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }, 100);
            }
          })
          .catch(err => console.error('Error fetching user profile:', err));
      }
    }
  }, []);

  // Завантажуємо оголошення з API з кешуванням
  useEffect(() => {
    const fetchListings = async () => {
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
    };

    fetchListings();
  }, [showToast]);

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

  // Скролимо нагору при відкритті/закритті товару або профілю
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
            onPreviewListing={setPreviewListing}
            hasMore={hasMore}
            onLoadMore={loadMoreListings}
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
            onPreviewListing={setPreviewListing}
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
            onPreviewListing={setPreviewListing}
            onNavigateToCatalog={() => setActiveTab('bazaar')}
            tg={tg}
          />
        );

      case 'profile':
        return <ProfileTab tg={tg} />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto">
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
        tg={tg}
      />

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
