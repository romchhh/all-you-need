import { ArrowLeft, Package, MessageCircle, Share2, X, Copy, Phone } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from './ListingCard';
import { ImageViewModal } from './ImageViewModal';
import { ShareModal } from './ShareModal';
import { TopBar } from './TopBar';
import { useLongPress } from '@/hooks/useLongPress';
import { getAvatarColor } from '@/utils/avatarColors';
import { getProfileShareLink } from '@/utils/botLinks';
import { useTelegram } from '@/hooks/useTelegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { useState, useEffect, useMemo, useCallback } from 'react';

interface UserProfilePageProps {
  sellerTelegramId: string;
  sellerName: string;
  sellerAvatar: string;
  sellerUsername?: string | null;
  sellerPhone?: string | null;
  onClose: () => void;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  favorites: Set<number>;
  tg: TelegramWebApp | null;
}

export const UserProfilePage = ({
  sellerTelegramId,
  sellerName,
  sellerAvatar,
  sellerUsername,
  sellerPhone,
  onClose,
  onSelectListing,
  onToggleFavorite,
  favorites,
  tg
}: UserProfilePageProps) => {
  const { t } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<{ username: string | null; phone: string | null } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [listingsOffset, setListingsOffset] = useState(0);
  const [totalListings, setTotalListings] = useState(0);
  const [stats, setStats] = useState<{
    totalListings: number;
    totalViews: number;
    soldListings: number;
    activeListings: number;
    createdAt: string;
  } | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const { user: currentUser } = useTelegram();

  const avatarLongPress = useLongPress({
    onLongPress: () => {
      if (sellerAvatar && (sellerAvatar.startsWith('/') || sellerAvatar.startsWith('http'))) {
        setShowAvatarModal(true);
        tg?.HapticFeedback.impactOccurred('medium');
      }
    },
    delay: 500,
  });

  const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        
        // Використовуємо комплексний endpoint для отримання всіх даних за один запит
        const viewerId = currentUser?.id?.toString() || '';
        const response = await fetch(`/api/user/profile-full?telegramId=${sellerTelegramId}&viewerId=${viewerId}&limit=16&offset=0`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Встановлюємо дані профілю
          if (data.profile) {
            setUserData({
              username: data.profile.username,
              phone: data.profile.phone,
            });
          }
          
          // Встановлюємо статистику
          if (data.stats) {
            setStats(data.stats);
          }
          
          // Встановлюємо оголошення
          if (data.listings) {
            setListings(data.listings.listings || []);
            setTotalListings(data.listings.total || 0);
            setHasMore((data.listings.listings?.length || 0) < (data.listings.total || 0));
            setListingsOffset(16);
          }
        } else {
          // Fallback до окремих запитів, якщо комплексний endpoint не працює
          const viewerId = currentUser?.id?.toString() || '';
          const listingsResponse = await fetch(`/api/listings?userId=${sellerTelegramId}&viewerId=${viewerId}&limit=16&offset=0`);
          if (listingsResponse.ok) {
            const listingsData = await listingsResponse.json();
            setListings(listingsData.listings || []);
            setTotalListings(listingsData.total || 0);
            setHasMore((listingsData.listings?.length || 0) < (listingsData.total || 0));
            setListingsOffset(16);
          }
          
          const profileResponse = await fetch(`/api/user/profile?telegramId=${sellerTelegramId}`);
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            setUserData({
              username: profileData.username,
              phone: profileData.phone,
            });
          }
          
          const statsResponse = await fetch(`/api/user/stats?telegramId=${sellerTelegramId}`);
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setStats(statsData);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
  }, [sellerTelegramId, currentUser?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMoreListings = async () => {
    try {
      const viewerId = currentUser?.id?.toString() || '';
      const response = await fetch(`/api/listings?userId=${sellerTelegramId}&viewerId=${viewerId}&limit=16&offset=${listingsOffset}`);
      if (response.ok) {
        const data = await response.json();
        setListings(prev => [...prev, ...(data.listings || [])]);
        setHasMore((listingsOffset + (data.listings?.length || 0)) < (data.total || 0));
        setListingsOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
    }
  };

  // Скролимо нагору при відкритті профілю
  useEffect(() => {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }, [sellerTelegramId]);

  // Додаємо свайп зліва для повернення назад
  useSwipeBack({
    onSwipeBack: onClose,
    enabled: true,
    tg
  });

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Хедер */}
      <TopBar
        variant="profile"
        onBack={onClose}
        onShareClick={() => setShowShareModal(true)}
        title={t('listing.sellerProfile')}
        tg={tg}
      />

      {/* Профіль */}
      <div className="p-4">
        <div className="flex flex-col items-center mb-6">
          <div 
            className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-4 relative cursor-pointer select-none"
            {...avatarLongPress}
          >
            {sellerAvatar && (sellerAvatar.startsWith('/') || sellerAvatar.startsWith('http')) ? (
              <>
                <div className="absolute inset-0 animate-pulse bg-gray-200" />
                <img 
                  src={(() => {
                    if (sellerAvatar?.startsWith('http')) return sellerAvatar;
                    const cleanPath = sellerAvatar?.split('?')[0] || sellerAvatar;
                    const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
                    return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
                  })()}
                  alt={sellerName}
                  className="w-full h-full object-cover relative z-10"
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      const placeholder = parent.querySelector('.avatar-placeholder');
                      if (placeholder) {
                        placeholder.classList.remove('hidden');
                      }
                    }
                  }}
                />
                <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(sellerName)} text-white text-2xl font-bold relative z-10`}>
                  {sellerName.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(sellerName)} text-white text-2xl font-bold`}>
                {sellerName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{sellerName}</h1>
          {(userData?.username || sellerUsername) && (
            <p className="text-gray-500 text-sm mb-4">@{userData?.username || sellerUsername}</p>
          )}
          
          {/* Статистика */}
          {stats && (
            <div className="w-full grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 mb-1">{stats.totalListings}</div>
                <div className="text-xs text-gray-500">{t('profile.listings')}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 mb-1">{stats.soldListings}</div>
                <div className="text-xs text-gray-500">{t('profile.sold')}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-900 mb-1">
                  {stats.createdAt ? (() => {
                    const createdDate = new Date(stats.createdAt);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - createdDate.getTime());
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    const diffMonths = Math.floor(diffDays / 30);
                    const diffYears = Math.floor(diffDays / 365);
                    
                    if (diffYears > 0) {
                      return `${diffYears} ${diffYears === 1 ? t('profile.year') : diffYears < 5 ? t('profile.years') : t('profile.yearsMany')}`;
                    } else if (diffMonths > 0) {
                      return `${diffMonths} ${diffMonths === 1 ? t('profile.month') : diffMonths < 5 ? t('profile.months') : t('profile.monthsMany')}`;
                    } else {
                      return `${diffDays} ${diffDays === 1 ? t('profile.day') : diffDays < 5 ? t('profile.days') : t('profile.daysMany')}`;
                    }
                  })() : '-'}
                </div>
                <div className="text-xs text-gray-500">{t('profile.onService')}</div>
              </div>
            </div>
          )}
        </div>

        {/* Кнопка дії */}
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-4 mb-6">
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const username = userData?.username || sellerUsername;
              const phone = userData?.phone || sellerPhone;
              
              // Якщо немає username - показуємо телефон
              if (!username || username.trim() === '') {
                if (phone && phone.trim() !== '') {
                  // Відкриваємо телефон
                  window.location.href = `tel:${phone.trim()}`;
                  tg?.HapticFeedback?.impactOccurred('medium');
                  return;
                } else {
                  // Немає ні username, ні телефону
                  if (tg) {
                    tg.showAlert(t('listingDetail.telegramIdNotFound'));
                  } else {
                    showToast(t('listingDetail.telegramIdNotFound'), 'error');
                  }
                  return;
                }
              }
              
              // Якщо є username - відкриваємо Telegram
              const link = `https://t.me/${username.replace('@', '')}`;
              
              // Якщо Telegram WebApp доступний, використовуємо його
              if (tg && tg.openTelegramLink) {
                tg.openTelegramLink(link);
                tg.HapticFeedback?.impactOccurred('medium');
              } else {
                // Якщо ні, відкриваємо посилання через звичайний браузер
                window.location.href = link;
              }
            }}
            className="w-full bg-blue-500 text-white py-4 rounded-xl font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {((userData?.username || sellerUsername) ?? '').trim() !== '' ? (
              <>
                <MessageCircle size={20} />
                {t('common.write')}
              </>
            ) : (
              <>
                <Phone size={20} />
                {t('common.call')}
              </>
            )}
          </button>
        </div>

        {/* Оголошення */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Оголошення продавця</h2>
          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
          ) : listings.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {listings.map(listing => (
                  <ListingCard 
                    key={listing.id} 
                    listing={listing}
                    isFavorite={favorites.has(listing.id)}
                    onSelect={(selectedListing) => {
                      // Оновлюємо дані перед закриттям профілю
                      fetchData();
                      onSelectListing(selectedListing);
                      // Закриваємо профіль продавця при виборі оголошення
                      onClose();
                    }}
                    onToggleFavorite={(id) => {
                      const isFavorite = favorites.has(id);
                      
                      // Оновлюємо лічильник лайків на картці товару
                      setListings(prev => prev.map(listing => 
                        listing.id === id 
                          ? { 
                              ...listing, 
                              favoritesCount: Math.max(0, (listing.favoritesCount || 0) + (isFavorite ? -1 : 1))
                            }
                          : listing
                      ));
                      
                      onToggleFavorite(id);
                    }}
                    tg={tg}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="py-6">
                  <button
                    onClick={loadMoreListings}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
                  >
                    Показати більше
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">{t('userProfile.noListings')}</div>
          )}
        </div>
      </div>

      {/* Модальне вікно для перегляду аватара */}
      {sellerAvatar && (sellerAvatar.startsWith('/') || sellerAvatar.startsWith('http')) && (
        <ImageViewModal
          isOpen={showAvatarModal}
          imageUrl={sellerAvatar}
          alt={sellerName}
          onClose={() => {
            setShowAvatarModal(false);
            // Оновлюємо дані після закриття модального вікна
            setTimeout(() => {
              fetchData();
            }, 200);
          }}
        />
      )}

      {/* Модальне вікно поділу */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          // Оновлюємо дані після закриття модального вікна
          setTimeout(() => {
            fetchData();
          }, 200);
        }}
        shareLink={getProfileShareLink(sellerTelegramId)}
        shareText={`👤 Профіль ${sellerName}${sellerUsername ? ` (@${sellerUsername})` : ''} в Trade Ground Marketplace`}
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

