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
import { ConfirmModal } from './ConfirmModal';
import { useState, useEffect, useMemo } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { formatTimeAgo } from '@/utils/formatTime';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';

// Динамічний імпорт PromotionModal та PaymentSummaryModal
const PromotionModal = dynamic(() => import('./PromotionModal'), {
  ssr: false,
});
const PaymentSummaryModal = dynamic(() => import('./PaymentSummaryModal').then(mod => ({ default: mod.PaymentSummaryModal })), {
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
  onBack?: () => void;
}

export const ListingDetail = ({ 
  listing, 
  isFavorite, 
  onClose, 
  onToggleFavorite,
  onSelectListing,
  onViewSellerProfile,
  favorites,
  tg,
  onBack
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
  const [showPaymentSummaryModal, setShowPaymentSummaryModal] = useState(false);
  const [selectedPromotionType, setSelectedPromotionType] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [showMarkSoldConfirm, setShowMarkSoldConfirm] = useState(false);
  const { user: currentUser } = useTelegram();
  const { profile } = useUser();
  const { t, language } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';
  
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

  // Заборона згортання міні-додатку на сторінці товару (як на головній сторінці)
  useEffect(() => {
    if (!tg) return;

    // Розгортаємо додаток на весь екран
    tg.expand();
    
    // Увімкнення підтвердження закриття для запобігання випадковому згортанню
    // Викликаємо при кожному рендері для надійності
    if (tg.enableClosingConfirmation) {
      tg.enableClosingConfirmation();
    }

    // Додатково перевіряємо та розгортаємо при скролі
    const handleScroll = () => {
      if (tg && tg.expand) {
        tg.expand();
      }
    };

    // Додаємо обробник скролу для підтримки розгорнутого стану
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      // НЕ вимикаємо підтвердження закриття при виході, 
      // щоб воно залишалося активним (як на головній сторінці)
    };
  }, [tg, listing.id]);

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

  // Завантаження балансу користувача
  const fetchUserBalance = async () => {
    const userTelegramId = currentUser?.id || profile?.telegramId;
    if (!userTelegramId) return;
    try {
      const response = await fetch(`/api/user/balance?telegramId=${userTelegramId}`);
      if (response.ok) {
        const data = await response.json();
        setUserBalance(data.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching user balance:', error);
    }
  };

  // Обробка підтвердження оплати в PaymentSummaryModal
  const handlePaymentConfirm = async (paymentMethod: 'balance' | 'direct') => {
    if (!selectedPromotionType) return;
    
    try {
      const userTelegramId = currentUser?.id || profile?.telegramId;
      if (!userTelegramId) {
        showToast(t('common.error'), 'error');
        return;
      }
      
      const response = await fetch('/api/listings/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: userTelegramId,
          listingId: listing.id,
          promotionType: selectedPromotionType,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to purchase promotion');
      }

      if (data.paymentRequired && data.pageUrl) {
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('payments.paymentInfo'), 'info');
        
        // Закриваємо мінідодаток перед редиректом на оплату
        try {
          if (tg?.close) {
            tg.close();
          }
        } catch (e) {
          console.error('[ListingDetail] Error closing WebApp:', e);
        }
        
        // Перенаправляємо на сторінку оплати
        if (tg?.openLink) {
          tg.openLink(data.pageUrl);
        } else {
          window.location.href = data.pageUrl;
        }
        return;
      } else {
        showToast(t('promotions.promotionSuccess'), 'success');
        tg?.HapticFeedback.notificationOccurred('success');
        
        // Оновлюємо дані оголошення після успішної покупки реклами
        const viewerId = currentUser?.id;
        const url = viewerId 
          ? `/api/listings/${listing.id}?viewerId=${viewerId}`
          : `/api/listings/${listing.id}`;
        
        try {
          const updatedResponse = await fetch(url, {
            method: 'GET',
          });
          if (updatedResponse.ok) {
            const updatedListing = await updatedResponse.json();
            // Оновлюємо дані через router.refresh() або оновлюємо локальний стан
            router.refresh();
          }
        } catch (error) {
          console.error('Error fetching updated listing:', error);
        }
      }

      setShowPaymentSummaryModal(false);
      setShowPromotionModal(false);
      setSelectedPromotionType(null);
    } catch (error: any) {
      console.error('Error purchasing promotion:', error);
      showToast(error.message || t('promotions.promotionError'), 'error');
      tg?.HapticFeedback.notificationOccurred('error');
    }
  };

  useEffect(() => {
    const fetchRelatedListings = async () => {
      try {
        setLoading(true);
        // Завантажуємо оголошення продавця (тільки активні)
        if (listing.seller.telegramId) {
          const viewerId = currentUser?.id?.toString() || '';
          // Додаємо фільтр status=active, щоб показувати тільки активні оголошення
          const sellerResponse = await fetch(`/api/listings?userId=${listing.seller.telegramId}&viewerId=${viewerId}&status=active&limit=16&offset=0`);
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
      const viewerId = currentUser?.id?.toString() || '';
      // Додаємо фільтр status=active, щоб показувати тільки активні оголошення
      const response = await fetch(`/api/listings?userId=${listing.seller.telegramId}&viewerId=${viewerId}&status=active&limit=16&offset=${sellerOffset}`);
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

      // Оновлюємо пов'язані оголошення (тільки активні)
      if (listing.seller.telegramId) {
        const viewerIdStr = currentUser?.id?.toString() || '';
        // Додаємо фільтр status=active, щоб показувати тільки активні оголошення
        const sellerResponse = await fetch(`/api/listings?userId=${listing.seller.telegramId}&viewerId=${viewerIdStr}&status=active&limit=16&offset=0`);
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
    enabled: false, // Вимкнено
    threshold: 120,
    tg
  });

  return (
    <div 
      className="min-h-screen pb-20 font-montserrat" 
      style={{ 
        position: 'relative', 
        overflowX: 'hidden',
        minHeight: '100vh',
        opacity: 1,
        display: 'block',
        visibility: 'visible',
        background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), #000000',
        zIndex: 1
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
      
      {/* Кнопки управління - фіксовані */}
      <div 
        className="fixed top-4 left-0 right-0 px-4 flex items-center justify-between pointer-events-none"
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1,
          zIndex: 100
        }}
      >
        <button
          onClick={() => {
            onBack?.();
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors pointer-events-auto bg-white"
        >
          <ArrowLeft size={20} className="text-gray-900" />
        </button>
        <button
          onClick={() => {
            onToggleFavorite(listing.id);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors pointer-events-auto bg-white"
        >
          <Heart 
            size={20} 
            className={isFavorite ? 'text-red-500' : 'text-gray-900'}
            fill={isFavorite ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      {/* Лого Trade Ground - частина сторінки */}
      <div 
        className="w-full px-4 pt-4 pb-3 flex items-center justify-center cursor-pointer"
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1
        }}
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.location.href = `/${lang}/bazaar`;
          }
        }}
      >
        <Image 
          src="/images/Group 1000007086.svg" 
          alt="Trade Ground" 
          width={204} 
          height={64.5}
          className="w-auto object-contain"
          style={{ height: '52.5px', width: 'auto' }}
          priority
        />
      </div>
      
      {/* Покращений pull-to-refresh індикатор */}
      {isPulling && (
        <div 
          className="fixed left-0 right-0 flex items-center justify-center z-40 pointer-events-none"
          style={{
            top: '70px',
            height: `${Math.min(pullDistance * 0.8, 100)}px`,
            opacity: Math.min(pullProgress * 1.2, 1),
            transform: `translateY(${Math.min(pullDistance * 0.4 - 50, 0)}px)`,
            transition: isRefreshing ? 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
          }}
        >
          <div 
            className="flex flex-col items-center gap-2 px-5 py-3 backdrop-blur-xl rounded-2xl shadow-2xl"
            style={{
              background: 'rgba(211, 241, 167, 0.95)',
              transform: `scale(${Math.min(0.85 + pullProgress * 0.15, 1)}) translateY(${isRefreshing ? '0' : `${-pullDistance * 0.1}px`})`,
              transition: isRefreshing ? 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.2s ease-out',
              boxShadow: `0 ${10 + pullProgress * 10}px ${20 + pullProgress * 10}px rgba(0, 0, 0, ${0.1 + pullProgress * 0.05})`,
              border: '1px solid rgba(63, 83, 49, 0.1)'
            }}
          >
            {isRefreshing ? (
              <>
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 border-3 rounded-full" style={{ borderColor: 'rgba(63, 83, 49, 0.2)' }}></div>
                  <div className="absolute inset-0 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3F5331' }}></div>
                </div>
                <span className="text-sm font-semibold" style={{ color: '#3F5331' }}>{t('common.loading')}</span>
              </>
            ) : pullProgress >= 1 ? (
              <>
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: '#3F5331' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#D3F1A7">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <span className="text-sm font-semibold" style={{ color: '#3F5331' }}>Відпустіть для оновлення</span>
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
                      stroke="rgba(63, 83, 49, 0.2)" 
                      strokeWidth="2.5"
                    />
                    <circle 
                      cx="12" 
                      cy="12" 
                      r="9" 
                      stroke="#3F5331" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${56.5 * pullProgress} ${56.5 * (1 - pullProgress)}`}
                      className="transition-all duration-200"
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#3F5331" style={{
                      transform: `translateY(${-2 + pullProgress * 2}px)`,
                      opacity: 0.6 + pullProgress * 0.4
                    }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                </div>
                <span 
                  className="text-xs font-medium"
                  style={{
                    color: '#3F5331',
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

      {/* Блок з рамкою зверху - містить фото та контент */}
      <div 
        className="mx-4 mt-4 rounded-t-3xl border-t-2 border-white bg-[#000000]"
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1
        }}
      >
        {/* Галерея фото */}
        <div className="px-4 pt-4" style={{ height: '400px' }}>
          <ImageGallery 
            images={images} 
            title={listing.title}
            onImageClick={(index) => setSelectedImageIndex(index)}
          />
        </div>

        {/* Контент */}
        <div className="p-4">
            {/* Ціна */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <div className={`text-3xl font-bold mb-1`} style={{ color: listing.isFree ? '#D3F1A7' : '#D3F1A7' }}>
                  {listing.isFree ? t('common.free') : listing.price}
                </div>
                {!listing.isFree && listing.currency && (
                  <span className="text-3xl font-bold" style={{ color: '#D3F1A7' }}>{getCurrencySymbol(listing.currency)}</span>
                )}
              </div>
            </div>

        {/* Заголовок */}
        <h1 className="text-xl font-semibold mb-4" style={{ color: '#FFFFFF' }}>{listing.title}</h1>

        {/* Статистика */}
        <div className="flex gap-4 mb-6 text-sm text-white/70">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-white/70 flex-shrink-0" />
            <span>{listing.location}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={16} className="text-white/70" />
            <span>{t('listing.created')}: {formattedTime}</span>
          </div>
        </div>

        {/* Стан товару */}
        {listing.condition && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/70">{t('listing.condition.label')}:</span>
              <span className="px-2.5 py-1 bg-[#2A2A2A] text-white text-xs font-semibold rounded">
                {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
              </span>
            </div>
          </div>
        )}

        {/* Опис */}
        <div className="mb-6 rounded-2xl p-4" style={{ background: '#1C1C1C' }}>
          <h2 className="font-semibold mb-2 text-white">{t('listing.description')}</h2>
          <p className="whitespace-pre-line leading-relaxed text-white">{listing.description}</p>
        </div>

        {/* Перегляди */}
        <div className="flex items-center gap-1 mb-3 text-sm text-white/70">
          <Eye size={16} className="text-white/70" />
          <span>{views} {t('listing.views')}</span>
        </div>

        {/* Дата публікації */}
        {listing.createdAt && (
          <div className="mb-6 text-sm text-white/70">
            <span>{t('listing.publishedDate')}: {formatPublicationDate(listing.createdAt, language)}</span>
          </div>
        )}

        {/* Інформація про рекламу для своїх оголошень */}
        {isOwnListing && listing.promotionType && listing.promotionEnds && new Date(listing.promotionEnds) > new Date() && (
          <div className="mb-6 flex items-center gap-2 text-sm">
            <span className="text-white/70">{t('sales.promotion')}:</span>
            <div className="flex items-center gap-2">
              {listing.promotionType === 'vip' && (
                <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap">
                  VIP
                </div>
              )}
              {listing.promotionType === 'top_category' && (
                <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap">
                  TOP
                </div>
              )}
              {listing.promotionType === 'highlighted' && (
                <span className="text-[#D3F1A7] font-semibold">{t('promotions.highlighted')}</span>
              )}
            </div>
          </div>
        )}

        {/* Продавець */}
        <div className="rounded-2xl p-4 mb-6 border border-white">
          <h2 className="font-semibold mb-4 text-white">{t('listing.seller')}</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 relative bg-white">
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
                  <div className="hidden avatar-placeholder w-full h-full flex items-center justify-center bg-white text-xl font-bold relative z-10 text-gray-700">
                    {listing.seller.name.charAt(0).toUpperCase()}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white text-xl font-bold text-gray-700">
                  {listing.seller.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-lg mb-1 text-white">{listing.seller.name}</p>
              {listing.seller.username && (
                <p className="text-sm mb-1 text-white/70">@{listing.seller.username}</p>
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
              className="w-full px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-white text-white bg-transparent hover:bg-white/10"
            >
              <User size={18} />
              {t('listing.viewSellerProfile')}
            </button>
          )}
        </div>

        </div>

        {/* Інші оголошення продавця */}
        {sellerListings.length > 0 && (
          <div className="mb-6" style={{ position: 'relative', zIndex: 10 }}>
            <h2 className="text-lg font-semibold mb-3 px-4" style={{ color: '#FFFFFF' }}>{t('listing.otherSellerListings')}</h2>
            <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', position: 'relative', zIndex: 10, width: '100vw' }}>
              <div className="flex gap-3 pl-4" style={{ minWidth: 'max-content' }}>
              {sellerListings.map(sellerListing => (
                  <div key={sellerListing.id} className="flex-shrink-0 w-[48vw] max-w-[240px]" style={{ position: 'relative', zIndex: 10, height: '400px' }}>
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
                {/* Невеликий відступ справа для останнього елемента */}
                <div className="flex-shrink-0 w-2" style={{ minWidth: '0.5rem' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Оголошення з категорії */}
        {categoryListings.length > 0 && (
          <div className="mb-6" style={{ position: 'relative', zIndex: 10 }}>
            <h2 className="text-lg font-semibold mb-3 px-4" style={{ color: '#FFFFFF' }}>{t('listing.similarListings')}</h2>
            <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', position: 'relative', zIndex: 10, width: '100vw' }}>
              <div className="flex gap-3 pl-4" style={{ minWidth: 'max-content' }}>
              {categoryListings.map(categoryListing => (
                  <div key={categoryListing.id} className="flex-shrink-0 w-[48vw] max-w-[240px]" style={{ position: 'relative', zIndex: 10, height: '400px' }}>
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
                {/* Невеликий відступ справа для останнього елемента */}
                <div className="flex-shrink-0 w-2" style={{ minWidth: '0.5rem' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Нижня панель з кнопкою */}
      <div className="fixed bottom-28 left-0 right-0 p-4 z-[50] max-w-2xl mx-auto" style={{ pointerEvents: 'auto' }}>
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
          className="w-full py-4 rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer font-montserrat text-xl"
          style={{
            background: '#D3F1A7',
            color: '#000000',
            border: 'none'
          }}
        >
          {isOwnListing ? (
            <>
              <TrendingUp size={24} />
              {t('sales.promote')}
            </>
          ) : (
            <>
              {listing.seller.username && listing.seller.username.trim() !== '' ? (
                <>
                  <MessageCircle size={24} />
                  {t('common.write')}
                </>
              ) : (
                <>
                  <Phone size={24} />
                  {t('common.call')}
                </>
              )}
            </>
          )}
        </button>
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
        <PromotionModal
          isOpen={showPromotionModal}
          onClose={() => setShowPromotionModal(false)}
          listingId={listing.id}
          currentPromotion={listing.promotionType}
          promotionEnds={listing.promotionEnds}
          telegramId={String(currentUser?.id || profile?.telegramId || '')}
          // Тут користувач явно натискає «Рекламувати» — кнопка «Опублікувати без реклами» не потрібна
          showSkipButton={false}
          onSelectPromotion={(promotionType) => {
            if (promotionType) {
              // Користувач вибрав рекламу - зберігаємо і відкриваємо PaymentSummaryModal
              setSelectedPromotionType(promotionType);
              setShowPromotionModal(false);
              setShowPaymentSummaryModal(true);
              fetchUserBalance(); // Оновлюємо баланс перед показом PaymentSummaryModal
            } else {
              // Користувач пропустив рекламу - просто закриваємо
              setShowPromotionModal(false);
            }
          }}
        />
      )}

      {/* Модальне вікно підтвердження оплати */}
      {selectedPromotionType && (
        <PaymentSummaryModal
          isOpen={showPaymentSummaryModal}
          onClose={() => {
            setShowPaymentSummaryModal(false);
            setSelectedPromotionType(null);
          }}
          onConfirm={handlePaymentConfirm}
          promotionType={selectedPromotionType}
          userBalance={userBalance}
          tg={tg}
        />
      )}

      {/* Модальне вікно підтвердження оплати */}
      {selectedPromotionType && (
        <PaymentSummaryModal
          isOpen={showPaymentSummaryModal}
          onClose={() => {
            setShowPaymentSummaryModal(false);
            setSelectedPromotionType(null);
          }}
          onConfirm={handlePaymentConfirm}
          promotionType={selectedPromotionType}
          userBalance={userBalance}
          tg={tg}
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

      {/* Підтвердження відмітки як продане */}
      <ConfirmModal
        isOpen={showMarkSoldConfirm}
        onClose={() => setShowMarkSoldConfirm(false)}
        onConfirm={async () => {
          try {
            // Перевіряємо статус модерації перед позначенням як продане
            if (listing.status === 'pending_moderation') {
              showToast(t('editListing.cannotEditOnModeration') || 'Не можна позначати як продане під час модерації', 'error');
              setShowMarkSoldConfirm(false);
              return;
            }

            const userTelegramId = currentUser?.id || profile?.telegramId;
            if (!userTelegramId) {
              showToast(t('editListing.updateError'), 'error');
              return;
            }

            const formData = new FormData();
            formData.append('title', listing.title);
            formData.append('description', listing.description);
            formData.append('price', listing.isFree ? '0' : listing.price);
            formData.append('isFree', listing.isFree ? 'true' : 'false');
            formData.append('category', listing.category);
            if (listing.subcategory) {
              formData.append('subcategory', listing.subcategory);
            }
            formData.append('location', listing.location);
            formData.append('condition', listing.condition || '');
            formData.append('telegramId', userTelegramId.toString());
            formData.append('status', 'sold');

            const response = await fetch(`/api/listings/${listing.id}/update`, {
              method: 'PUT',
              body: formData,
            });

            if (response.ok) {
              showToast(t('editListing.listingMarkedSold'), 'success');
              tg?.HapticFeedback.notificationOccurred('success');
              setShowMarkSoldConfirm(false);
              // Оновлюємо сторінку
              router.refresh();
              // Закриваємо детальний перегляд
              onClose();
            } else {
              showToast(t('editListing.updateError'), 'error');
            }
          } catch (error) {
            console.error('Error marking listing as sold:', error);
            showToast(t('editListing.updateError'), 'error');
          }
        }}
        title={t('editListing.markAsSold')}
        message={t('editListing.confirmMarkSold')}
        confirmText={t('editListing.markAsSold')}
        cancelText={t('common.cancel')}
        confirmButtonClass="bg-green-500 hover:bg-green-600"
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

