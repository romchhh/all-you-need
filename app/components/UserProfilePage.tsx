import { ArrowLeft, Package, MessageCircle, Phone, Share2, X, Copy } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from './ListingCard';
import { ImageViewModal } from './ImageViewModal';
import { useLongPress } from '@/hooks/useLongPress';
import { useState, useEffect } from 'react';

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
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<{ username: string | null; phone: string | null } | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const avatarLongPress = useLongPress({
    onLongPress: () => {
      if (sellerAvatar && (sellerAvatar.startsWith('/') || sellerAvatar.startsWith('http'))) {
        setShowAvatarModal(true);
        tg?.HapticFeedback.impactOccurred('medium');
      }
    },
    delay: 500,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Завантажуємо оголошення
        const listingsResponse = await fetch(`/api/listings?userId=${sellerTelegramId}&limit=16&offset=0`);
        if (listingsResponse.ok) {
          const listingsData = await listingsResponse.json();
          setListings(listingsData.listings || []);
          setTotalListings(listingsData.total || 0);
          setHasMore((listingsData.listings?.length || 0) < (listingsData.total || 0));
          setListingsOffset(16);
        }
        
        // Завантажуємо дані профілю для отримання username та phone
        const profileResponse = await fetch(`/api/user/profile?telegramId=${sellerTelegramId}`);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setUserData({
            username: profileData.username,
            phone: profileData.phone,
          });
        }
        
        // Завантажуємо статистику
        const statsResponse = await fetch(`/api/user/stats?telegramId=${sellerTelegramId}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sellerTelegramId]);

  const loadMoreListings = async () => {
    try {
      const response = await fetch(`/api/listings?userId=${sellerTelegramId}&limit=16&offset=${listingsOffset}`);
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

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Хедер */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <button 
          onClick={() => {
            onClose();
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-900" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">Профіль продавця</h2>
        <button 
          onClick={() => {
            if (tg) {
              const botUrl = process.env.NEXT_PUBLIC_BOT_URL || 'https://t.me/your_bot';
              const shareLink = `${botUrl}?start=user_${sellerTelegramId}`;
              tg.openTelegramLink(shareLink);
              tg.HapticFeedback.impactOccurred('light');
            }
          }}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <Share2 size={20} className="text-gray-900" />
        </button>
      </div>

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
                  src={sellerAvatar} 
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
                <div className="hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white text-2xl font-bold relative z-10">
                  {sellerName.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white text-2xl font-bold">
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
                <div className="text-xs text-gray-500">Оголошень</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 mb-1">{stats.soldListings}</div>
                <div className="text-xs text-gray-500">Продано</div>
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
                      return `${diffYears} ${diffYears === 1 ? 'рік' : diffYears < 5 ? 'роки' : 'років'}`;
                    } else if (diffMonths > 0) {
                      return `${diffMonths} ${diffMonths === 1 ? 'міс' : diffMonths < 5 ? 'міс' : 'міс'}`;
                    } else {
                      return `${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дні' : 'днів'}`;
                    }
                  })() : '-'}
                </div>
                <div className="text-xs text-gray-500">На сервісі</div>
              </div>
            </div>
          )}
        </div>

        {/* Кнопки дій */}
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-4 flex gap-3 mb-6">
          <button 
            type="button"
            onClick={() => {
              const phone = userData?.phone || sellerPhone;
              if (phone) {
                setShowPhoneModal(true);
                tg?.HapticFeedback.impactOccurred('medium');
              } else {
                tg?.showAlert('Номер телефону не вказано');
                tg?.HapticFeedback.impactOccurred('medium');
              }
            }}
            className="flex-1 bg-gray-100 text-blue-600 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer border border-gray-200"
          >
            <Phone size={20} />
            Зателефонувати
          </button>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const username = userData?.username || sellerUsername;
              console.log('Написати clicked, sellerTelegramId:', sellerTelegramId, 'username:', username);
              
              let link = '';
              
              if (username) {
                // Якщо є username, використовуємо його
                link = `https://t.me/${username}`;
              } else if (sellerTelegramId && String(sellerTelegramId).trim() !== '') {
                // Використовуємо tg://user?id= для відкриття чату з користувачем за ID
                link = `tg://user?id=${sellerTelegramId}`;
              } else {
                console.log('Telegram ID and username not found');
                if (tg) {
                  tg.showAlert('Telegram ID не знайдено');
                } else {
                  alert('Telegram ID не знайдено');
                }
                return;
              }
              
              console.log('Opening Telegram link:', link);
              
              // Якщо Telegram WebApp доступний, використовуємо його
              if (tg && tg.openTelegramLink) {
                tg.openTelegramLink(link);
                tg.HapticFeedback?.impactOccurred('medium');
              } else {
                // Якщо ні, відкриваємо посилання через звичайний браузер
                window.location.href = link;
              }
            }}
            className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle size={20} />
            Написати
          </button>
        </div>

        {/* Оголошення */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Оголошення продавця</h2>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Завантаження...</div>
          ) : listings.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {listings.map(listing => (
                  <ListingCard 
                    key={listing.id} 
                    listing={listing}
                    isFavorite={favorites.has(listing.id)}
                    onSelect={(selectedListing) => {
                      onSelectListing(selectedListing);
                      // Закриваємо профіль продавця при виборі оголошення
                      onClose();
                    }}
                    onToggleFavorite={onToggleFavorite}
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
            <div className="text-center py-8 text-gray-500">Немає оголошень</div>
          )}
        </div>
      </div>

      {/* Модальне вікно для номера телефону */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => {
          setShowPhoneModal(false);
          setCopied(false);
        }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-slide-up shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Номер телефону</h3>
              <button
                onClick={() => {
                  setShowPhoneModal(false);
                  setCopied(false);
                }}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={20} className="text-gray-900" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-2xl font-semibold text-gray-900 text-center mb-6">
                {userData?.phone || sellerPhone}
              </p>
              {copied && (
                <div className="mb-4 text-center">
                  <p className="text-green-600 font-semibold">Скопійовано!</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const phone = userData?.phone || sellerPhone;
                    if (phone) {
                      window.location.href = `tel:${phone}`;
                    }
                    tg?.HapticFeedback.impactOccurred('medium');
                  }}
                  className="flex-1 bg-gray-100 text-blue-600 py-4 rounded-2xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer border border-gray-200"
                >
                  <Phone size={20} />
                  Подзвонити
                </button>
                <button
                  onClick={() => {
                    const phone = userData?.phone || sellerPhone;
                    if (phone && navigator.clipboard) {
                      navigator.clipboard.writeText(phone);
                      setCopied(true);
                      tg?.HapticFeedback.impactOccurred('medium');
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="flex-1 bg-[#6366F1] text-white py-4 rounded-full font-semibold hover:bg-[#4F46E5] transition-colors flex items-center justify-center gap-2 shadow-md"
                >
                  <Copy size={20} />
                  Скопіювати
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно для перегляду аватара */}
      {sellerAvatar && (sellerAvatar.startsWith('/') || sellerAvatar.startsWith('http')) && (
        <ImageViewModal
          isOpen={showAvatarModal}
          imageUrl={sellerAvatar}
          alt={sellerName}
          onClose={() => setShowAvatarModal(false)}
        />
      )}
    </div>
  );
};

