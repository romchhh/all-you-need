import { ArrowLeft, Package, MessageCircle, Share2, X, Copy, Phone, Megaphone } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from './ListingCard';
import { ImageViewModal } from './ImageViewModal';
import { ShareModal } from './ShareModal';
import { PhoneModal } from './PhoneModal';
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
  onBackToPreviousListing?: (() => void) | null;
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
  tg,
  onBackToPreviousListing
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
  const [showPhoneModal, setShowPhoneModal] = useState(false);
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
      const isOwnProfile = viewerId && parseInt(viewerId) === parseInt(sellerTelegramId);
      // Для чужого профілю використовуємо profile-full endpoint, який фільтрує тільки активні
      const endpoint = isOwnProfile 
        ? `/api/listings?userId=${sellerTelegramId}&viewerId=${viewerId}&limit=16&offset=${listingsOffset}`
        : `/api/user/profile-full?telegramId=${sellerTelegramId}&viewerId=${viewerId}&limit=16&offset=${listingsOffset}`;
      
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        const newListings = data.listings?.listings || data.listings || [];
        setListings(prev => [...prev, ...newListings]);
        const total = data.listings?.total || data.total || 0;
        setHasMore((listingsOffset + newListings.length) < total);
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
    onSwipeBack: () => {
      // Якщо є функція повернення до попередньої картки товару, використовуємо її
      if (onBackToPreviousListing) {
        onBackToPreviousListing();
      } else {
        onClose();
      }
    },
    enabled: true,
    tg
  });

  const displayUsername = (userData?.username || sellerUsername) ? `@${userData?.username || sellerUsername}` : '';

  // Розраховуємо час на сервісі
  const getServiceTime = useMemo(() => {
    if (!stats?.createdAt) return null;
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
  }, [stats?.createdAt, t]);

  return (
    <div className="pb-24 min-h-screen">
      {/* Хедер з заголовком */}
      <div className="px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          {/* Кнопка назад */}
          <button
            onClick={() => {
              if (onBackToPreviousListing) {
                onBackToPreviousListing();
              } else {
                onClose();
              }
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full border border-white flex items-center justify-center hover:bg-white/10 transition-colors text-white"
          >
            <ArrowLeft size={20} />
          </button>

          {/* Текст "Профіль продавця" */}
          <h2 className="text-lg font-semibold text-white">{t('profile.sellerProfile')}</h2>

          {/* Кнопка поділу */}
          <button
            onClick={() => {
              setShowShareModal(true);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full border border-white flex items-center justify-center hover:bg-white/10 transition-colors text-white"
          >
            <Share2 size={18} />
          </button>
        </div>

        {/* Фото профілю по центру */}
        <div className="flex justify-center mb-4">
          <div 
            className="w-24 h-24 rounded-full overflow-hidden bg-white flex-shrink-0 relative cursor-pointer select-none border-2 border-white"
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
                <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center ${getAvatarColor(sellerName)} text-white text-2xl font-bold relative z-10`}>
                  {sellerName.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${getAvatarColor(sellerName)} text-white text-2xl font-bold`}>
                {sellerName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Ім'я продавця */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white">{sellerName}</h2>
        </div>

        {/* Блоки зі статистикою */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Блок 1: Оголошень */}
          <div className="rounded-2xl p-3 sm:p-4 border border-white text-center">
            <div className="text-xl sm:text-2xl font-bold text-white mb-1">
              {stats ? (currentUser?.id && parseInt(currentUser.id.toString()) === parseInt(sellerTelegramId) ? stats.totalListings : stats.activeListings) : 0}
            </div>
            <div className="text-xs sm:text-sm text-white/70 leading-tight">{t('profile.listings')}</div>
          </div>

          {/* Блок 2: Продано */}
          <div className="rounded-2xl p-3 sm:p-4 border border-white text-center">
            <div className="text-xl sm:text-2xl font-bold text-white mb-1">
              {stats?.soldListings || 0}
            </div>
            <div className="text-xs sm:text-sm text-white/70 leading-tight">{t('profile.sold')}</div>
          </div>

          {/* Блок 3: На сервісі */}
          <div className="rounded-2xl p-3 sm:p-4 border border-white text-center">
            <div className="text-xl sm:text-2xl font-bold text-white mb-1">
              {getServiceTime || '0 ' + t('profile.days')}
            </div>
            <div className="text-xs sm:text-sm text-white/70 leading-tight">{t('profile.onService')}</div>
          </div>
        </div>
      </div>

      {/* Розділювач */}
      <div className="px-4 pb-4">
        <div className="border-t border-white/20"></div>
      </div>

      {/* Кнопка дії */}
      <div className="px-4 space-y-3 pb-4">
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
                // Відкриваємо модальне вікно телефону
                setShowPhoneModal(true);
                tg?.HapticFeedback?.impactOccurred('light');
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
          className="w-full bg-[#D3F1A7] hover:bg-[#D3F1A7]/90 text-black font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors"
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

      {/* Розділювач */}
      <div className="px-4 pb-4">
        <div className="border-t border-white/20"></div>
      </div>

      {/* Оголошення */}
      <div className="px-4">
        <h3 className="text-lg font-semibold text-white mb-3">{t('listing.sellerListings')}</h3>
        {loading ? (
          <div className="text-center py-8 text-white/70">{t('common.loading')}</div>
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
            {hasMore && listings.length < totalListings && (
              <div className="py-6">
                <button
                  onClick={loadMoreListings}
                  className="w-full bg-transparent hover:bg-white/10 border-2 border-white text-white font-semibold py-4 rounded-2xl transition-colors"
                >
                  {t('common.showMore')}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-white/70">{t('userProfile.noListings')}</div>
        )}
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

      {/* Модальне вікно телефону */}
      {(userData?.phone || sellerPhone) && (
        <PhoneModal
          isOpen={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          phoneNumber={(userData?.phone || sellerPhone) || ''}
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

