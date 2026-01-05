import { ArrowLeft, Heart, Share2, MessageCircle, User, Eye, MapPin, Clock, X, TrendingUp } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ImageGallery } from './ImageGallery';
import { ListingCard } from './ListingCard';
import { ShareModal } from './ShareModal';
import { TopBar } from './TopBar';
import { getAvatarColor } from '@/utils/avatarColors';
import { getListingShareLink } from '@/utils/botLinks';
import { useTelegram } from '@/hooks/useTelegram';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useState, useEffect, useMemo } from 'react';
import { getCurrencySymbol } from '@/utils/currency';

// Функція для форматування дати публікації
const formatPublicationDate = (dateString: string, lang: 'uk' | 'ru'): string => {
  const date = new Date(dateString);
  
  const monthsUk = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  
  const monthsRu = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  
  const months = lang === 'ru' ? monthsRu : monthsUk;
  const day = date.getDate();
  const month = months[date.getMonth()];
  
  return `${day} ${month}`;
};

interface ListingDetailProps {
  listing: Listing;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: (id: number) => void;
  onSelectListing?: (listing: Listing) => void;
  onViewSellerProfile?: (telegramId: string, name: string, avatar: string, username?: string, phone?: string) => void;
  favorites: Set<number>;
  tg: TelegramWebApp | null;
}

export const ListingDetail = ({ 
  listing, 
  isFavorite, 
  onClose, 
  onToggleFavorite,
          onSelectListing,
          onViewSellerProfile,
          favorites,
          tg 
}: ListingDetailProps) => {
  const sellerUsername = listing.seller.username;
  const sellerPhone = listing.seller.phone;
  const images = listing.images || [listing.image];
  const [sellerListings, setSellerListings] = useState<Listing[]>([]);
  const [categoryListings, setCategoryListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState(listing.views);
  const [sellerHasMore, setSellerHasMore] = useState(false);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [sellerOffset, setSellerOffset] = useState(0);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [sellerTotal, setSellerTotal] = useState(0);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const { user: currentUser } = useTelegram();
  const { profile } = useUser();
  const { t, language } = useLanguage();
  
  // Перевіряємо, чи це власне оголошення
  const isOwnListing = useMemo(() => {
    // Спробуємо отримати telegramId з різних джерел
    const currentTelegramId = currentUser?.id || (profile?.telegramId ? parseInt(profile.telegramId) : null);
    const sellerTelegramId = listing.seller.telegramId;
    
    if (!currentTelegramId || !sellerTelegramId) {
      console.log('Missing IDs for comparison:', { currentTelegramId, sellerTelegramId, currentUser, profile, seller: listing.seller });
      return false;
    }
    
    const currentIdStr = String(currentTelegramId);
    const sellerIdStr = String(sellerTelegramId);
    const isOwn = currentIdStr === sellerIdStr;
    
    console.log('Checking if own listing:', {
      currentTelegramId,
      sellerTelegramId,
      currentIdStr,
      sellerIdStr,
      isOwn,
      currentUser,
      profile,
      seller: listing.seller
    });
    
    return isOwn;
  }, [currentUser?.id, profile?.telegramId, listing.seller.telegramId]);

  // Скролимо нагору при відкритті нового оголошення
  useEffect(() => {
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
  }, [listing.id]);

  // Фіксуємо перегляд при відкритті оголошення
  useEffect(() => {
    const recordView = async () => {
      try {
        // Передаємо viewerId для відстеження унікальних переглядів
        const viewerId = currentUser?.id;
        const url = viewerId 
          ? `/api/listings/${listing.id}?viewerId=${viewerId}`
          : `/api/listings/${listing.id}`;
        
        const response = await fetch(url, {
          method: 'GET',
        });
        if (response.ok) {
          const updatedListing = await response.json();
          setViews(updatedListing.views);
        }
      } catch (error) {
        console.error('Error recording view:', error);
      }
    };

    recordView();
  }, [listing.id, currentUser?.id]);

  useEffect(() => {
    const fetchRelatedListings = async () => {
      try {
        setLoading(true);
        // Завантажуємо оголошення продавця (передаємо viewerId, щоб приховати продані для інших користувачів)
        if (listing.seller.telegramId) {
          const viewerId = currentUser?.id?.toString() || '';
          const sellerResponse = await fetch(`/api/listings?userId=${listing.seller.telegramId}&viewerId=${viewerId}&limit=16&offset=0`);
          if (sellerResponse.ok) {
            const sellerData = await sellerResponse.json();
            const filtered = (sellerData.listings || []).filter((l: Listing) => l.id !== listing.id);
            setSellerListings(filtered);
            setSellerTotal(sellerData.total || 0);
            setSellerHasMore(filtered.length < ((sellerData.total || 0) - 1));
            setSellerOffset(16);
          }
        }
        
        // Завантажуємо оголошення з категорії
        const categoryResponse = await fetch(`/api/listings?category=${listing.category}&limit=16&offset=0`);
        if (categoryResponse.ok) {
          const categoryData = await categoryResponse.json();
          const filtered = (categoryData.listings || []).filter((l: Listing) => l.id !== listing.id);
          setCategoryListings(filtered);
          setCategoryTotal(categoryData.total || 0);
          setCategoryHasMore(filtered.length < ((categoryData.total || 0) - 1));
          setCategoryOffset(16);
        }
      } catch (error) {
        console.error('Error fetching related listings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedListings();
  }, [listing.id, listing.seller.telegramId, listing.category, listing.price, listing.isFree]);

  const loadMoreSellerListings = async () => {
    if (!listing.seller.telegramId) return;
    try {
      const response = await fetch(`/api/listings?userId=${listing.seller.telegramId}&limit=16&offset=${sellerOffset}`);
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.listings || []).filter((l: Listing) => l.id !== listing.id);
        setSellerListings(prev => [...prev, ...filtered]);
        setSellerHasMore((sellerOffset + filtered.length) < ((data.total || 0) - 1));
        setSellerOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
      }
    } catch (error) {
      console.error('Error loading more seller listings:', error);
    }
  };

  const loadMoreCategoryListings = async () => {
    try {
      const response = await fetch(`/api/listings?category=${listing.category}&limit=16&offset=${categoryOffset}`);
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.listings || []).filter((l: Listing) => l.id !== listing.id);
        setCategoryListings(prev => [...prev, ...filtered]);
        setCategoryHasMore((categoryOffset + filtered.length) < ((data.total || 0) - 1));
        setCategoryOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
      }
    } catch (error) {
      console.error('Error loading more category listings:', error);
    }
  };

  // Додаємо свайп зліва для повернення назад
  useSwipeBack({
    onSwipeBack: onClose,
    enabled: true,
    tg
  });

  // Функція для оновлення даних
  const handleRefresh = async () => {
    try {
      // Оновлюємо основні дані оголошення
      const viewerId = currentUser?.id;
      const url = viewerId 
        ? `/api/listings/${listing.id}?viewerId=${viewerId}`
        : `/api/listings/${listing.id}`;
      
      const response = await fetch(url, {
        method: 'GET',
      });
      if (response.ok) {
        const updatedListing = await response.json();
        setViews(updatedListing.views);
      }

      // Оновлюємо пов'язані оголошення
      if (listing.seller.telegramId) {
        const viewerIdStr = currentUser?.id?.toString() || '';
        const sellerResponse = await fetch(`/api/listings?userId=${listing.seller.telegramId}&viewerId=${viewerIdStr}&limit=16&offset=0`);
        if (sellerResponse.ok) {
          const sellerData = await sellerResponse.json();
          const filtered = (sellerData.listings || []).filter((l: Listing) => l.id !== listing.id);
          setSellerListings(filtered);
          setSellerTotal(sellerData.total || 0);
          setSellerHasMore(filtered.length < ((sellerData.total || 0) - 1));
        }
      }
      
      const categoryResponse = await fetch(`/api/listings?category=${listing.category}&limit=16&offset=0`);
      if (categoryResponse.ok) {
        const categoryData = await categoryResponse.json();
        const filtered = (categoryData.listings || []).filter((l: Listing) => l.id !== listing.id);
        setCategoryListings(filtered);
        setCategoryTotal(categoryData.total || 0);
        setCategoryHasMore(filtered.length < ((categoryData.total || 0) - 1));
      }
    } catch (error) {
      console.error('Error refreshing listing:', error);
    }
  };

  // Додаємо pull-to-refresh
  const { isPulling, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: true,
    tg
  });

  return (
    <div className="min-h-screen bg-white pb-20" style={{ position: 'relative' }}>
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
      {/* Хедер */}
      <TopBar
        variant="detail"
        onBack={onClose}
        onShareClick={() => setShowShareModal(true)}
        onFavoriteClick={() => onToggleFavorite(listing.id)}
        isFavorite={isFavorite}
        title={listing.title}
        tg={tg}
      />

      {/* Галерея фото */}
      <ImageGallery images={images} title={listing.title} />

      {/* Контент */}
      <div className="p-4">
            {/* Ціна */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <div className={`text-3xl font-bold mb-1 ${listing.isFree ? 'text-green-600' : 'text-gray-900'}`}>
                  {listing.isFree ? t('common.free') : listing.price}
                </div>
                {!listing.isFree && listing.currency && (
                  <span className="text-3xl font-bold text-gray-900">{getCurrencySymbol(listing.currency)}</span>
                )}
              </div>
            </div>

        {/* Заголовок */}
        <h1 className="text-xl font-semibold text-gray-900 mb-4">{listing.title}</h1>

        {/* Статистика */}
        <div className="flex gap-4 mb-6 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <MapPin size={16} className="text-gray-400" />
            <span>{listing.location}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={16} className="text-gray-400" />
            <span>{t('listing.created')}: {listing.posted}</span>
          </div>
        </div>

        {/* Опис */}
        <div className="mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">{t('listing.description')}</h2>
          <p className="text-gray-700 whitespace-pre-line leading-relaxed">{listing.description}</p>
        </div>

        {/* Перегляди */}
        <div className="flex items-center gap-1 mb-3 text-sm text-gray-500">
          <Eye size={16} className="text-gray-400" />
          <span>{views} {t('listing.views')}</span>
        </div>

        {/* Дата публікації */}
        {listing.createdAt && (
          <div className="mb-6 text-sm text-gray-500">
            <span>{t('listing.publishedDate')}: {formatPublicationDate(listing.createdAt, language)}</span>
          </div>
        )}

        {/* Продавець */}
        <div className="border border-gray-200 rounded-2xl p-4 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">{t('listing.seller')}</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 relative">
              {listing.seller.avatar && (listing.seller.avatar.startsWith('/') || listing.seller.avatar.startsWith('http')) ? (
                <>
                  <div className="absolute inset-0 animate-pulse bg-gray-200" />
                  <img 
                    src={(() => {
                      if (listing.seller.avatar?.startsWith('http')) return listing.seller.avatar;
                      const cleanPath = listing.seller.avatar?.split('?')[0] || listing.seller.avatar;
                      const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
                      return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
                    })()}
                    alt={listing.seller.name}
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
                  <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(listing.seller.name)} text-white text-xl font-bold relative z-10`}>
                    {listing.seller.name.charAt(0).toUpperCase()}
                  </div>
                </>
              ) : (
                <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(listing.seller.name)} text-white text-xl font-bold`}>
                  {listing.seller.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-lg mb-1">{listing.seller.name}</p>
              {listing.seller.username && (
                <p className="text-sm text-gray-500 mb-1">@{listing.seller.username}</p>
              )}
            </div>
          </div>
          {onViewSellerProfile && listing.seller.telegramId && !isOwnListing && (
            <button 
              onClick={() => {
                onViewSellerProfile(
                  listing.seller.telegramId!, 
                  listing.seller.name, 
                  listing.seller.avatar,
                  sellerUsername || undefined,
                  sellerPhone || undefined
                );
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-full px-4 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <User size={18} />
              {t('listing.viewSellerProfile')}
            </button>
          )}
        </div>

        {/* Інші оголошення продавця */}
        {sellerListings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('listing.otherSellerListings')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {sellerListings.map(sellerListing => (
                <ListingCard 
                  key={sellerListing.id} 
                  listing={sellerListing}
                  isFavorite={favorites.has(sellerListing.id)}
                  onSelect={(l) => {
                    if (onSelectListing) {
                      onSelectListing(l);
                    }
                  }}
                  onToggleFavorite={onToggleFavorite}
                  tg={tg}
                />
              ))}
            </div>
            {sellerHasMore && (
              <div className="mt-4">
                <button
                  onClick={loadMoreSellerListings}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
                >
                  {t('common.showMore')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Оголошення з категорії */}
        {categoryListings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('listing.similarListings')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {categoryListings.map(categoryListing => (
                <ListingCard 
                  key={categoryListing.id} 
                  listing={categoryListing}
                  isFavorite={favorites.has(categoryListing.id)}
                  onSelect={(l) => {
                    if (onSelectListing) {
                      onSelectListing(l);
                    }
                  }}
                  onToggleFavorite={onToggleFavorite}
                  tg={tg}
                />
              ))}
            </div>
            {categoryHasMore && (
              <div className="mt-4">
                <button
                  onClick={loadMoreCategoryListings}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
                >
                  {t('common.showMore')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Нижня панель з кнопкою */}
      <div className="fixed bottom-20 left-0 right-0 p-4 z-[50] max-w-2xl mx-auto" style={{ pointerEvents: 'auto' }}>
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-4">
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              if (isOwnListing) {
                // Якщо це власне оголошення - показуємо функцію реклами (поки що просто повідомлення)
                if (tg) {
                  tg.showAlert('Функція реклами буде доступна найближчим часом');
                } else {
                  alert('Функція реклами буде доступна найближчим часом');
                }
                tg?.HapticFeedback.impactOccurred('light');
                return;
              }
              
              const telegramId = listing.seller.telegramId;
              const username = listing.seller.username;
              console.log('Написати clicked, telegramId:', telegramId, 'username:', username, 'listing.seller:', listing.seller);
              
              let link = '';
              
              if (username) {
                // Якщо є username, використовуємо його
                link = `https://t.me/${username}`;
              } else if (telegramId && String(telegramId).trim() !== '') {
                // Використовуємо tg://user?id= для відкриття чату з користувачем за ID
                link = `tg://user?id=${telegramId}`;
              } else {
                console.log('Telegram ID and username not found');
                if (tg) {
                  tg.showAlert(t('listingDetail.telegramIdNotFound'));
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
            className={`w-full ${isOwnListing ? 'bg-purple-500 hover:bg-purple-600' : 'bg-blue-500 hover:bg-blue-600'} text-white py-4 rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer`}
          >
            {isOwnListing ? (
              <>
                <TrendingUp size={20} />
                {t('sales.promote')}
              </>
            ) : (
              <>
                <MessageCircle size={20} />
                {t('common.write')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Модальне вікно поділу */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareLink={getListingShareLink(listing.id)}
        shareText={`📦 ${listing.title} - ${listing.price} в AYN Marketplace`}
        tg={tg}
      />
    </div>
  );
};

