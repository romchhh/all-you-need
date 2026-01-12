import { ArrowLeft, Heart, Share2, MessageCircle, User, Eye, MapPin, Clock, X, TrendingUp, Phone } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ImageGallery } from './ImageGallery';
import { ListingCard } from './ListingCard';
import { ShareModal } from './ShareModal';
import { ImageViewModal } from './ImageViewModal';
import dynamic from 'next/dynamic';
import { TopBar } from './TopBar';
import { getAvatarColor } from '@/utils/avatarColors';
import { getListingShareLink } from '@/utils/botLinks';
import { useTelegram } from '@/hooks/useTelegram';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { useState, useEffect, useMemo } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { formatTimeAgo } from '@/utils/formatTime';

// Динамічний імпорт PromotionUpgradeModal
const PromotionUpgradeModal = dynamic(() => import('./PromotionUpgradeModal'), {
  ssr: false,
});

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
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const { user: currentUser } = useTelegram();
  const { profile } = useUser();
  const { t, language } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  
  // Форматуємо час на клієнті з перекладами
  const formattedTime = useMemo(() => {
    if (listing.createdAt) {
      return formatTimeAgo(listing.createdAt, t);
    }
    return listing.posted || '';
  }, [listing.createdAt, listing.posted, t]);
  
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

  // Скролимо нагору при відкритті нового оголошення - ЗАВЖДИ
  useEffect(() => {
    // Функція для скролу нагору - використовуємо кілька методів для надійності
    const forceScrollToTop = () => {
      if (typeof window === 'undefined') return;
      
      try {
        // Додаємо клас для вимкнення smooth scroll
        const html = document.documentElement;
        const body = document.body;
        html.classList.add('no-smooth-scroll');
        html.classList.remove('smooth-scroll');
        
        // Миттєвий скрол всіма можливими способами
        window.scrollTo(0, 0);
        html.scrollTop = 0;
        body.scrollTop = 0;
        
        // Для Telegram WebApp та інших браузерів
        if (window.scrollY !== 0) {
          window.scroll(0, 0);
        }
        
        // Також скролимо всі можливі контейнери
        const scrollableElements = document.querySelectorAll('[data-scroll-container]');
        scrollableElements.forEach(el => {
          if (el instanceof HTMLElement) {
            el.scrollTop = 0;
          }
        });
        
        // Відновлюємо smooth scroll через невелику затримку
        setTimeout(() => {
          html.classList.remove('no-smooth-scroll');
          html.classList.add('smooth-scroll');
        }, 100);
      } catch (error) {
        console.error('Error scrolling to top:', error);
      }
    };

    // Виконуємо скрол негайно, синхронно
    forceScrollToTop();

    // Через мікротаск (Promise) - виконається після поточного рендеру
    Promise.resolve().then(forceScrollToTop);

    // Через requestAnimationFrame - виконається перед наступним рендером
    const rafId1 = requestAnimationFrame(forceScrollToTop);
    
    // Через другий requestAnimationFrame - для подвійної гарантії
    const rafId2 = requestAnimationFrame(() => {
      requestAnimationFrame(forceScrollToTop);
    });

    // Через невеликі затримки для надійності на повільних пристроях
    const timeoutId1 = setTimeout(forceScrollToTop, 0);
    const timeoutId2 = setTimeout(forceScrollToTop, 50);
    const timeoutId3 = setTimeout(forceScrollToTop, 100);
    const timeoutId4 = setTimeout(forceScrollToTop, 200);

    return () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      clearTimeout(timeoutId4);
    };
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
  const [swipeProgress, setSwipeProgress] = useState(0);
  
  useSwipeBack({
    onSwipeBack: onClose,
    onSwipeProgress: setSwipeProgress,
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
  const { isPulling, pullDistance, pullProgress, isRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: true,
    threshold: 120,
    tg
  });

  return (
    <div 
      className="min-h-screen bg-white pb-20" 
      style={{ 
        position: 'relative', 
        overflowX: 'hidden',
        minHeight: '100vh',
        opacity: 1,
        display: 'block',
        visibility: 'visible'
      }}
    >
      
      {/* Візуальний індикатор свайпу назад */}
      {swipeProgress > 0 && (
        <div 
          className="fixed inset-0 bg-black z-[45] pointer-events-none"
          style={{ 
            opacity: Math.min(swipeProgress / 150, 0.35),
            transition: swipeProgress === 0 ? 'opacity 0.3s ease-out' : 'none'
          }}
        />
      )}
      
      {/* Хедер - закріплений */}
      <div 
        className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm"
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      >
      <TopBar
        variant="detail"
        onBack={onClose}
        onShareClick={() => setShowShareModal(true)}
        onFavoriteClick={() => onToggleFavorite(listing.id)}
        isFavorite={isFavorite}
        title={listing.title}
        tg={tg}
      />
      </div>
      
      {/* Spacer для хедера */}
      <div className="h-[64px]"></div>
      
      {/* Покращений pull-to-refresh індикатор */}
      {isPulling && (
        <div 
          className="fixed top-16 left-0 right-0 flex items-center justify-center z-40 pointer-events-none"
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
                      stroke="url(#gradient-listing)" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${56.5 * pullProgress} ${56.5 * (1 - pullProgress)}`}
                      className="transition-all duration-200"
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                    <defs>
                      <linearGradient id="gradient-listing" x1="0%" y1="0%" x2="100%" y2="100%">
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

      {/* Галерея фото */}
      <div
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1
        }}
      >
        <ImageGallery 
          images={images} 
          title={listing.title}
          onImageClick={(index) => setSelectedImageIndex(index)}
        />
      </div>

      {/* Контент */}
      <div 
        className="p-4"
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1
        }}
      >
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
            <span>{t('listing.created')}: {formattedTime}</span>
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
            <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {sellerListings.map(sellerListing => (
                  <div key={sellerListing.id} className="flex-shrink-0 w-[48vw] max-w-[240px]">
                <ListingCard 
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
            </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Оголошення з категорії */}
        {categoryListings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('listing.similarListings')}</h2>
            <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {categoryListings.map(categoryListing => (
                  <div key={categoryListing.id} className="flex-shrink-0 w-[48vw] max-w-[240px]">
                <ListingCard 
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
            </div>
                ))}
              </div>
            </div>
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
                // Якщо це власне оголошення - відкриваємо модальне вікно реклами
                setShowPromotionModal(true);
                tg?.HapticFeedback.impactOccurred('light');
                return;
              }
              
              const telegramId = listing.seller.telegramId;
              const username = listing.seller.username;
              const phone = listing.seller.phone;
              
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
            className={`w-full ${isOwnListing ? 'bg-purple-500 hover:bg-purple-600' : 'bg-blue-500 hover:bg-blue-600'} text-white py-4 rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer`}
          >
            {isOwnListing ? (
              <>
                <TrendingUp size={20} />
                {t('sales.promote')}
              </>
            ) : (
              <>
                {listing.seller.username && listing.seller.username.trim() !== '' ? (
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
        shareText={`📦 ${listing.title} - ${listing.price} в Trade Ground Marketplace`}
        tg={tg}
      />

      {/* Модальне вікно реклами/апгрейду */}
      {showPromotionModal && (
        <PromotionUpgradeModal
          isOpen={showPromotionModal}
          onClose={() => setShowPromotionModal(false)}
          listingId={listing.id}
          currentPromotion={listing.promotionType}
          telegramId={String(currentUser?.id || profile?.telegramId || '')}
          onSelectPromotion={async (promotionType, paymentMethod) => {
            try {
              const userTelegramId = currentUser?.id || profile?.telegramId;
              console.log('Purchasing promotion:', { userTelegramId, promotionType, paymentMethod });
              
              const response = await fetch('/api/listings/promotions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  telegramId: userTelegramId,
                  listingId: listing.id,
                  promotionType,
                  paymentMethod,
                }),
              });

              const data = await response.json();

              if (!response.ok) {
                throw new Error(data.error || 'Failed to purchase promotion');
              }

              if (data.paymentRequired && data.pageUrl) {
                // Використовуємо той самий метод, що й TopUpBalanceModal
                tg?.HapticFeedback.notificationOccurred('success');
                showToast(t('payments.paymentInfo'), 'info');
                
                // Перенаправляємо на сторінку оплати
                window.location.href = data.pageUrl;
                return;
              } else {
                showToast(t('promotions.promotionSuccess'), 'success');
                tg?.HapticFeedback.notificationOccurred('success');
              }

              setShowPromotionModal(false);
            } catch (error: any) {
              console.error('Error purchasing promotion:', error);
              showToast(error.message || t('promotions.promotionError'), 'error');
              tg?.HapticFeedback.notificationOccurred('error');
            }
          }}
        />
      )}

      {/* Модальне вікно перегляду фото */}
      {selectedImageIndex !== null && images[selectedImageIndex] && (
        <ImageViewModal
          isOpen={selectedImageIndex !== null}
          images={images.map(img => {
            if (img?.startsWith('http')) return img;
            const cleanPath = img?.split('?')[0] || img;
            const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
            return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
          })}
          initialIndex={selectedImageIndex}
          alt={`${listing.title}`}
          onClose={() => setSelectedImageIndex(null)}
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

