'use client';

import { useState, useEffect, useRef } from 'react';
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
import { getFavoritesFromStorage, getFavoritesFromStorageSync, addFavoriteToStorage, removeFavoriteFromStorage } from '@/utils/favorites';
import { CreateListingModal } from '@/components/CreateListingModal';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';

const ProfilePage = () => {
  const params = useParams();
  const pathname = usePathname();
  
  // Автоматичний prefetching для покращення UX
  useAutoPrefetch(pathname);
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { profile } = useUser();
  
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
  
  // Завантажуємо обране з API при завантаженні
  useEffect(() => {
    const loadFavorites = async () => {
      if (profile?.telegramId) {
        const favorites = await getFavoritesFromStorage(profile.telegramId);
        setFavorites(favorites);
      } else {
        // Fallback до localStorage, якщо немає profile
        const savedFavorites = getFavoritesFromStorageSync();
        setFavorites(savedFavorites);
      }
    };
    loadFavorites();
  }, [profile?.telegramId]);

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
    if (!profile?.telegramId) {
      // Якщо немає profile, використовуємо старий спосіб (localStorage)
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(id)) {
          newFavorites.delete(id);
          tg?.HapticFeedback.notificationOccurred('success');
          showToast(t('listing.removeFromFavorites'), 'success');
        } else {
          newFavorites.add(id);
          tg?.HapticFeedback.notificationOccurred('success');
          showToast(t('listing.addToFavorites'), 'success');
        }
        return newFavorites;
      });
      return;
    }

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
    
    // Виконуємо операцію через API
    try {
      if (isFavorite) {
        await removeFavoriteFromStorage(id, profile.telegramId);
        showToast(t('listing.removeFromFavorites'), 'success');
      } else {
        await addFavoriteToStorage(id, profile.telegramId);
        showToast(t('listing.addToFavorites'), 'success');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Відкатуємо зміни при помилці
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (isFavorite) {
          newFavorites.add(id);
        } else {
          newFavorites.delete(id);
        }
        return newFavorites;
      });
      showToast(t('common.error') || 'Помилка', 'error');
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

  useEffect(() => {
    if (selectedListing || selectedSeller) {
      savedScrollPositionRef.current = window.scrollY || document.documentElement.scrollTop;
      
      const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };

      scrollToTop();
      requestAnimationFrame(() => {
        scrollToTop();
        requestAnimationFrame(() => {
          scrollToTop();
          setTimeout(() => {
            scrollToTop();
          }, 100);
        });
      });
    } else {
      if (savedScrollPositionRef.current > 0) {
        const scrollPos = savedScrollPositionRef.current;
        setTimeout(() => {
          window.scrollTo({ top: scrollPos, behavior: 'smooth' });
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
          onClose={() => {
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

    return <ProfileTab tg={tg} onSelectListing={setSelectedListing} onCreateListing={() => setIsCreateListingModalOpen(true)} onEditModalChange={setIsEditModalOpen} />;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden max-w-full">
      <div className="max-w-2xl mx-auto w-full overflow-x-hidden">
        {renderContent()}
      </div>

      {!isEditModalOpen && (
      <BottomNavigation
        activeTab="profile"
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
      )}

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

export default ProfilePage;

