import { ArrowLeft, Heart, Share2, MessageCircle, User, MapPin, Clock, X, TrendingUp, Phone, Eye } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ImageGallery } from './ImageGallery';
import { ListingCard } from './ListingCard';
import { ShareModal } from './ShareModal';
import { ImageViewModal } from './ImageViewModal';
import { PhoneModal } from './PhoneModal';
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
import { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { formatTimeAgo } from '@/utils/formatTime';
import { getListingDisplayDate, parseDbDate } from '@/utils/parseDbDate';
import { descriptionWithLinks } from '@/utils/descriptionLinks';
import { useRouter, useParams } from 'next/navigation';
import { TradeGroundLogo } from '@/components/TradeGroundLogo';
import { getCategories } from '@/constants/categories';
import { getListingCategoryLabel } from '@/utils/listingCategoryLabel';
import { buildListingImageUrl } from '@/utils/listingImageUrl';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { BRAND_GREEN_ON_DARK, BRAND_GREEN_PRICE_ON_LIGHT } from '@/constants/brandColors';

// Динамічний імпорт PromotionModal та PaymentSummaryModal
const PromotionModal = dynamic(() => import('./PromotionModal'), {
  ssr: false,
});
const PaymentSummaryModal = dynamic(() => import('./PaymentSummaryModal').then(mod => ({ default: mod.PaymentSummaryModal })), {
  ssr: false,
});

// Функція для форматування дати публікації
const formatPublicationDate = (dateInput: string | Date, lang: 'uk' | 'ru'): string => {
  if (dateInput === '' || dateInput == null) return '';
  const date =
    dateInput instanceof Date
      ? dateInput
      : parseDbDate(dateInput) ?? new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';

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
  const [sellerHasMore, setSellerHasMore] = useState(false);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [sellerOffset, setSellerOffset] = useState(0);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [sellerTotal, setSellerTotal] = useState(0);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showPaymentSummaryModal, setShowPaymentSummaryModal] = useState(false);
  const [selectedPromotionType, setSelectedPromotionType] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [showMarkSoldConfirm, setShowMarkSoldConfirm] = useState(false);
  const [autoRenewLocal, setAutoRenewLocal] = useState(!!listing.autoRenew);
  const [autoRenewSaving, setAutoRenewSaving] = useState(false);
  const { user: currentUser } = useTelegram();
  const { profile } = useUser();
  const { t, language } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';
  const isSeoListingRoute = Boolean((params as any)?.id);
  const categories = useMemo(() => getCategories(t), [t]);
  const isTelegramEnv = !!tg;
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  /** Нижня CTA на сторінці товару: у темній темі — неоновий лайм як основний акцент */
  const listingPrimaryCtaClass = isLight
    ? 'bg-[#3F5331] text-white hover:bg-[#344728] [&_svg]:text-white'
    : 'border-none bg-[#C8E6A0] text-[#0f1408] shadow-[0_0_22px_rgba(200,230,160,0.48)] hover:bg-[#dff5c0] hover:shadow-[0_0_28px_rgba(200,230,160,0.58)] [&_svg]:text-[#0f1408]';

  const categoryLabel = useMemo(
    () => getListingCategoryLabel(categories, listing.category, listing.subcategory, t),
    [categories, listing.category, listing.subcategory, t]
  );
  const telegramShareImageUrl = useMemo(() => {
    const publicBaseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_WEBAPP_URL ||
      'https://tradegrnd.com';
    const candidate = listing.images?.[0] || listing.image;
    const normalizedCandidate = (candidate || '').split('?')[0].replace(/^\/+/, '');
    const parsedPhotosMatch = normalizedCandidate.match(
      /(?:^|\/)parsed_photos\/(.+)$/
    );
    const rawUrl = parsedPhotosMatch
      ? `/api/parsed-images/${parsedPhotosMatch[1]}`
      : buildListingImageUrl(candidate);
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;
    return new URL(rawUrl, publicBaseUrl).toString();
  }, [listing.image, listing.images]);
  const telegramShareDescription = useMemo(() => {
    const raw = listing.description || '';
    // Прибираємо службовий хвіст парсера (лінк на оригінал + канал-джерело)
    const cleaned = raw
      .replace(/🔗\s*Оригінальне оголошення:[\s\S]*$/i, '')
      .replace(/🔗\s*Оригинальное объявление:[\s\S]*$/i, '')
      .replace(/📢\s*Оголошення знайдено з\s*@[\w\d_]+[\s\S]*$/i, '')
      .replace(/📢\s*Объявление найдено из\s*@[\w\d_]+[\s\S]*$/i, '');
    return cleaned.replace(/\s+/g, ' ').trim().slice(0, 180);
  }, [listing.description]);
  
  // Визначення мобільної версії (безпечно для SSR)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Форматуємо час на клієнті з перекладами
  const formattedTime = useMemo(() => {
    const d = getListingDisplayDate(listing);
    if (d) return formatTimeAgo(d, t);
    return listing.posted || '';
  }, [listing.createdAt, listing.publishedAt, listing.posted, t]);
  
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

  useEffect(() => {
    setAutoRenewLocal(!!listing.autoRenew);
  }, [listing.id, listing.autoRenew]);

  const viewerTelegramIdStr = String(currentUser?.id || profile?.telegramId || '');

  // Скролимо нагору при відкритті нового оголошення
  // useLayoutEffect виконується СИНХРОННО перед рендером - це ключ до успіху
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    // Вимкнення автоматичного відновлення позиції скролу браузером
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // ЖОРСТКО фіксуємо scroll на 0 - СИНХРОННО, без behavior
    // Це критично для мобільних WebView
    document.body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [listing.id]);
  
  // Додаткова перевірка через useEffect для мобільних WebView
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Перевіряємо і фіксуємо scroll після рендеру (для мобільних)
    const checkAndFixScroll = () => {
      if (window.scrollY > 10 || document.documentElement.scrollTop > 10) {
        document.body.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    };
    
    // Кілька спроб для мобільних WebView
    requestAnimationFrame(checkAndFixScroll);
    setTimeout(checkAndFixScroll, 50);
    setTimeout(checkAndFixScroll, 100);
  }, [listing.id]);

  // Заборона згортання міні-додатку на сторінці товару (як на головній сторінці)
  useEffect(() => {
    if (!tg) return;

    // Розгортаємо додаток на весь екран
    tg.expand();
    
    // Увімкнення підтвердження закриття для запобігання випадковому згортанню
    if (tg.enableClosingConfirmation) {
      tg.enableClosingConfirmation();
    }
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
          await response.json();
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
        
        // Відкриваємо посилання на оплату всередині WebApp (не закриваємо його)
        // Використовуємо window.location.href для відкриття в тому ж вікні
        window.location.href = data.pageUrl;
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
  }, [listing.id, listing.seller.telegramId, listing.category, currentUser?.id]);

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
        await response.json();
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

  const pageBackground = isLight
    ? 'radial-gradient(ellipse 90% 120% at 14% -8%, rgba(63, 83, 49, 0.1) 0%, transparent 52%), linear-gradient(180deg, #ffffff 0%, #f5f6f3 100%)'
    : 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), #000000';

  return (
    <div 
      className="min-h-screen pb-20 font-montserrat lg:px-6 xl:px-8" 
      style={{ 
        position: 'relative', 
        overflowX: 'hidden',
        minHeight: '100vh',
        opacity: 1,
        display: 'block',
        visibility: 'visible',
        background: pageBackground,
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
      
      {/* Лого зверху як на головній; ряд кнопок нижче — у потоці, як на сторінці профілю продавця */}
      <div
        className="w-full lg:pt-4"
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1,
        }}
      >
        <div className="w-full px-4 lg:px-6 xl:px-8">
          <TradeGroundLogo
            paddingX={false}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = `/${lang}/bazaar`;
              }
            }}
            className="pb-3"
          />
        </div>
        <div className="px-4 pb-1 lg:px-6 xl:px-8">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  onClose();
                }
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                isLight
                  ? 'border-gray-300 text-gray-900 hover:bg-gray-100'
                  : 'border-white text-white hover:bg-white/10'
              }`}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowShareModal(true);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  isLight
                    ? 'border-gray-300 text-gray-900 hover:bg-gray-100'
                    : 'border-white text-white hover:bg-white/10'
                }`}
              >
                <Share2 size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleFavorite(listing.id);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  isLight
                    ? 'border-gray-300 text-gray-900 hover:bg-gray-100'
                    : 'border-white text-white hover:bg-white/10'
                }`}
              >
                <Heart
                  size={20}
                  className={isFavorite ? 'text-red-500' : ''}
                  fill={isFavorite ? 'currentColor' : 'none'}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Покращений pull-to-refresh індикатор */}
      {isPulling && (
        <div 
          className="fixed left-0 right-0 flex items-center justify-center z-40 pointer-events-none"
          style={{
            top: 'max(5.75rem, calc(env(safe-area-inset-top, 0px) + 5.75rem))',
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
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#3F5331">
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

      {/* Блок з рамкою зверху — на десктопі: галерея зліва, текст справа */}
      <div 
        className={`mx-4 mt-4 overflow-hidden rounded-3xl lg:mx-auto lg:mt-8 lg:max-w-5xl xl:max-w-6xl ${
          isLight
            ? 'bg-white shadow-md shadow-gray-900/[0.07] ring-1 ring-gray-900/[0.04]'
            : 'bg-[#000000] shadow-lg shadow-black/30'
        }`}
        style={{
          transform: swipeProgress > 0 ? `translateX(${swipeProgress}px)` : 'translateX(0)',
          transition: swipeProgress === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out' : 'none',
          opacity: swipeProgress > 0 ? 1 - (swipeProgress / 250) : 1,
          overflow: 'visible'
        }}
      >
        <div className="w-full min-w-0 lg:flex lg:flex-row lg:items-stretch lg:gap-8 xl:gap-10">
        {/* Галерея фото */}
        <div 
          className={`w-full min-h-[360px] max-h-[620px] px-0 pb-0 pt-4 sm:max-h-[640px] lg:flex lg:h-auto lg:min-h-[min(420px,70vh)] lg:max-h-[min(640px,85vh)] lg:w-[42%] lg:max-w-xl lg:min-w-[300px] lg:shrink-0 lg:items-center lg:justify-center lg:self-stretch lg:pl-8 lg:pr-2 lg:pt-0 lg:pb-6 xl:pl-10 ${
            isMobile ? 'h-[60svh]' : 'h-[85svh] max-lg:h-[85svh]'
          }`}
          style={{ 
            ...(tg ? { paddingBottom: '0px' } : {})
          }}
        >
          <div className="h-full w-full min-h-0 lg:max-h-full">
          <ImageGallery 
            images={images} 
            title={listing.title}
            onImageClick={(index) => setSelectedImageIndex(index)}
          />
          </div>
        </div>

        {/* Контент */}
        <div 
          className={`min-w-0 flex-1 px-4 pb-6 lg:pl-4 lg:pr-10 lg:pb-10 lg:pt-8 xl:pr-12 ${tg ? 'max-lg:pt-1' : 'max-lg:pt-2'}`}
        >
            {/* Ціна */}
            <div className="mt-3 mb-4">
              <div className="flex items-center gap-2">
                {(() => {
                  const isNegotiable = listing.price === t('common.negotiable') || listing.price === 'Договірна' || listing.price === 'Договорная';
                  const isFree = listing.isFree;
                  
                  const priceColor = isLight ? BRAND_GREEN_PRICE_ON_LIGHT : BRAND_GREEN_ON_DARK;
                  if (isFree) {
                    return (
                      <div className="text-3xl font-bold mb-1" style={{ color: priceColor }}>
                        {t('common.free')}
                      </div>
                    );
                  }
                  
                  if (isNegotiable) {
                    return (
                      <div className="text-xl font-bold mb-1" style={{ color: priceColor }}>
                        {t('common.negotiable')}
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="text-3xl font-bold mb-1" style={{ color: priceColor }}>
                        {listing.price}
                      </div>
                      {listing.currency && (
                        <span className="text-3xl font-bold" style={{ color: priceColor }}>{getCurrencySymbol(listing.currency)}</span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

        {/* Заголовок */}
        <h1 className={`mb-1 text-xl font-semibold tracking-tight lg:text-2xl ${isLight ? 'text-gray-900' : 'text-white'}`}>
          {listing.title}
        </h1>
        {categoryLabel && (
          <div className={`mb-3 text-sm ${ac.mutedText}`}>
            {categoryLabel}
          </div>
        )}

        {/* Статистика */}
        <div className={`flex flex-wrap gap-x-4 gap-y-2 mb-6 text-sm ${ac.mutedText}`}>
          <div className="flex items-center gap-2 tabular-nums" title={t('listing.viewsLabel')}>
            <Eye size={16} className={`flex-shrink-0 ${ac.mutedText}`} />
            <span>{listing.views ?? 0}</span>
          </div>
          <div className="flex items-center gap-2 tabular-nums" title={t('listing.favoritesLabel')}>
            <Heart size={16} className={`flex-shrink-0 ${ac.mutedText}`} strokeWidth={2} />
            <span>{listing.favoritesCount ?? 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={16} className={`flex-shrink-0 ${ac.mutedText}`} />
            <span>{listing.location}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={16} className={ac.mutedText} />
            <span>{t('listing.created')}: {formattedTime}</span>
          </div>
        </div>

        {/* Стан товару */}
        {listing.condition && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${ac.mutedText}`}>{t('listing.condition.label')}:</span>
              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  isLight ? 'bg-gray-200 text-gray-800' : 'bg-[#2A2A2A] text-white'
                }`}
              >
                {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
              </span>
            </div>
          </div>
        )}

        {/* Опис */}
        <div
          className={`mb-6 min-w-0 rounded-2xl p-4 sm:p-5 ${
            isLight ? 'bg-gray-50' : ''
          }`}
          style={{ background: isLight ? undefined : '#1C1C1C' }}
        >
          <h2 className={`font-semibold mb-3 text-base sm:text-lg ${isLight ? 'text-gray-900' : 'text-white'}`}>
            {t('listing.description')}
          </h2>
          <div
            className={`max-w-prose whitespace-pre-line text-[15px] leading-[1.65] sm:text-base sm:leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] ${
              isLight ? 'text-gray-800' : 'text-white/95'
            }`}
          >
            {descriptionWithLinks(listing.description || '')}
          </div>
        </div>

        {/* Дата публікації */}
        {(listing.publishedAt || listing.createdAt) && (
          <div className={`mb-6 text-sm ${ac.mutedText}`}>
            <span>
              {t('listing.publishedDate')}:{' '}
              {formatPublicationDate(
                getListingDisplayDate(listing) ?? listing.createdAt ?? '',
                language
              )}
            </span>
          </div>
        )}

        {/* Інформація про рекламу для своїх оголошень */}
        {isOwnListing && listing.promotionType && listing.promotionEnds && new Date(listing.promotionEnds) > new Date() && (
          <div className="mb-6 flex items-center gap-2 text-sm">
            <span className={ac.mutedText}>{t('sales.promotion')}:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {listing.promotionType.split(',').map((promoType: string) => {
                const trimmedType = promoType.trim();
                if (trimmedType === 'vip') {
                  return (
                    <div key="vip" className="px-2.5 py-1 bg-[#3F5331] text-white text-xs font-bold rounded whitespace-nowrap">
                      VIP
                    </div>
                  );
                }
                if (trimmedType === 'top_category') {
                  return (
                    <div key="top" className="px-2.5 py-1 bg-[#3F5331] text-white text-xs font-bold rounded whitespace-nowrap">
                      TOP
                    </div>
                  );
                }
                if (trimmedType === 'highlighted') {
                  return (
                    <span key="highlighted" className={`font-semibold ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`}>{t('promotions.highlighted')}</span>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}

        {/* Продавець */}
        <div
          className={`mb-6 rounded-2xl p-4 ${
            isLight ? 'bg-gray-50/90' : 'bg-[#141414]'
          }`}
        >
          <h2 className={`font-semibold mb-4 ${isLight ? 'text-gray-900' : 'text-white'}`}>{t('listing.seller')}</h2>
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
              <p className={`font-semibold text-lg mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>{listing.seller.name}</p>
              {listing.seller.username && (
                <p className={`text-sm mb-1 ${ac.mutedText}`}>@{listing.seller.username}</p>
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
              className={`w-full rounded-xl px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
                isLight
                  ? 'bg-gray-100 text-gray-900 hover:bg-gray-200/80'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <User size={18} />
              {t('listing.viewSellerProfile')}
            </button>
          )}
        </div>

        </div>
        </div>

        {/* Інші оголошення продавця — під блоком галерея+контент (не в одному flex-ряду) */}
        {sellerListings.length > 0 && (
          <div
            className="w-full min-w-0 px-4 pb-4 pt-10 lg:px-6 lg:pb-6 lg:pt-12"
            style={{ overflow: 'visible' }}
          >
            <h2 className={`mb-4 text-lg font-semibold lg:text-xl ${isLight ? 'text-gray-900' : 'text-white'}`}>
              {t('listing.otherSellerListings')}
            </h2>
            <div
              className="scrollbar-hide w-full max-w-full overflow-x-auto pb-2"
              style={{ WebkitOverflowScrolling: 'touch', overflowY: 'visible' }}
            >
              <div className="flex gap-3 pr-1" style={{ minWidth: 'max-content' }}>
                {sellerListings.map((sellerListing) => (
                  <div key={sellerListing.id} className="w-[48vw] max-w-[240px] flex-shrink-0 lg:w-56 lg:max-w-[240px]" style={{ overflow: 'visible' }}>
                    <ListingCard
                      listing={sellerListing}
                      layout="stacked"
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
                <div className="w-2 min-w-[0.5rem] flex-shrink-0 shrink-0" aria-hidden />
              </div>
            </div>
          </div>
        )}

        {/* Оголошення з категорії */}
        {categoryListings.length > 0 && (
          <div
            className="w-full min-w-0 px-4 pb-8 pt-10 lg:px-6 lg:pb-10 lg:pt-12"
            style={{ overflow: 'visible' }}
          >
            <h2 className={`mb-4 text-lg font-semibold lg:text-xl ${isLight ? 'text-gray-900' : 'text-white'}`}>
              {t('listing.similarListings')}
            </h2>
            <div
              className="scrollbar-hide w-full max-w-full overflow-x-auto pb-2"
              style={{ WebkitOverflowScrolling: 'touch', overflowY: 'visible' }}
            >
              <div className="flex gap-3 pr-1" style={{ minWidth: 'max-content' }}>
                {categoryListings.map((categoryListing) => (
                  <div key={categoryListing.id} className="w-[48vw] max-w-[240px] flex-shrink-0 lg:w-56 lg:max-w-[240px]" style={{ overflow: 'visible' }}>
                    <ListingCard
                      listing={categoryListing}
                      layout="stacked"
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
                <div className="w-2 min-w-[0.5rem] flex-shrink-0 shrink-0" aria-hidden />
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Нижня панель з кнопкою */}
      <div
        className="fixed bottom-28 left-0 right-0 z-[50] mx-auto max-w-2xl space-y-3 px-4 py-4 lg:max-w-5xl lg:px-6 xl:max-w-6xl xl:px-8"
        style={{ pointerEvents: 'auto' }}
      >
        {isOwnListing &&
          listing.status === 'active' &&
          isTelegramEnv &&
          !isSeoListingRoute &&
          viewerTelegramIdStr && (
            <label
              className={`flex cursor-pointer select-none items-start gap-3 rounded-2xl border px-3 py-2.5 ${
                isLight
                  ? 'border-gray-200 bg-white/95 text-gray-900 shadow-sm'
                  : 'border-white/15 bg-black/50 text-white/90 backdrop-blur-sm'
              }`}
            >
              <input
                type="checkbox"
                className={`mt-0.5 h-4 w-4 shrink-0 rounded border focus:ring-2 ${
                  isLight
                    ? 'border-gray-300 text-[#5a7c2e] focus:ring-[#3F5331]/60'
                    : 'border-white/40 bg-black/40 text-[#C8E6A0] focus:ring-[#3F5331]/50'
                }`}
                checked={autoRenewLocal}
                disabled={autoRenewSaving}
                onChange={async (e) => {
                  const next = e.target.checked;
                  setAutoRenewSaving(true);
                  try {
                    const res = await fetch(`/api/listings/${listing.id}/auto-renew`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        telegramId: viewerTelegramIdStr,
                        autoRenew: next,
                      }),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error((err as { error?: string }).error || 'Request failed');
                    }
                    setAutoRenewLocal(next);
                    showToast(t('sales.autoRenewSaved'), 'success');
                    tg?.HapticFeedback?.impactOccurred('light');
                  } catch {
                    e.target.checked = !next;
                    showToast(t('sales.autoRenewError'), 'error');
                    tg?.HapticFeedback?.notificationOccurred('error');
                  } finally {
                    setAutoRenewSaving(false);
                  }
                }}
              />
              <span className="min-w-0 text-xs leading-snug">
                <span className={`font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  {t('sales.autoRenew')}
                </span>
                <span className={`mt-0.5 block ${isLight ? 'text-gray-600' : 'text-white/65'}`}>
                  {t('sales.autoRenewHint')}
                </span>
              </span>
            </label>
          )}
        {(isSeoListingRoute || !isTelegramEnv) && (
          <div
            className={`rounded-xl px-3 py-2 text-center text-xs shadow-sm ${
              isLight
                ? 'bg-gray-50 text-gray-700 ring-1 ring-gray-900/[0.05]'
                : 'bg-white/10 text-white/80'
            }`}
          >
            Повний перегляд товару, актуальний статус та зв'язок з продавцем доступні у Telegram‑боті Trade Ground Marketplace.
          </div>
        )}
        {isSeoListingRoute ? (
          <a
            href="https://t.me/TradeGroundBot?start=linktowatch_12"
            className={`w-full rounded-2xl border-none py-4 font-montserrat text-xl font-semibold flex cursor-pointer items-center justify-center gap-2 transition-colors ${listingPrimaryCtaClass}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={24} />
            Відкрити товар у Telegram‑боті
          </a>
        ) : isTelegramEnv ? (
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
            className={`w-full rounded-2xl py-4 font-montserrat text-xl font-semibold transition-colors flex cursor-pointer items-center justify-center gap-2 ${listingPrimaryCtaClass}`}
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
        ) : (
          <a
            href="https://t.me/TradeGroundBot?start=linktowatch_12"
            className={`w-full rounded-2xl border-none py-4 font-montserrat text-xl font-semibold flex cursor-pointer items-center justify-center gap-2 transition-colors ${listingPrimaryCtaClass}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={24} />
            Відкрити товар у Telegram‑боті
          </a>
        )}
      </div>

      {/* Модальне вікно поділу */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareLink={getListingShareLink(listing.id)}
        shareText={(() => {
          const isNegotiable = listing.price === t('common.negotiable') || listing.price === 'Договірна' || listing.price === 'Договорная';
          const priceText = listing.isFree 
            ? t('common.free') 
            : (isNegotiable 
              ? t('common.negotiable') 
              : `${listing.price}${listing.currency ? getCurrencySymbol(listing.currency) : '€'}`);
          return `📦 ${listing.title} - ${priceText} в Trade Ground Marketplace`;
        })()}
        telegramTitle={listing.title}
        telegramDescription={telegramShareDescription}
        telegramImageUrl={telegramShareImageUrl || undefined}
        tg={tg}
      />

      {/* Модальне вікно реклами/апгрейду — передаємо поточну рекламу тільки якщо вона ще активна, щоб можна було купити знову після закінчення */}
      {showPromotionModal && (
        <PromotionModal
          isOpen={showPromotionModal}
          onClose={() => setShowPromotionModal(false)}
          listingId={listing.id}
          currentPromotion={listing.promotionEnds && new Date(listing.promotionEnds) > new Date() ? listing.promotionType : null}
          promotionEnds={listing.promotionEnds && new Date(listing.promotionEnds) > new Date() ? listing.promotionEnds : null}
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

      {/* Модальне вікно перегляду фото */}
      {selectedImageIndex !== null && images[selectedImageIndex] && (
        <ImageViewModal
          isOpen={selectedImageIndex !== null}
          images={images.map((img) => buildListingImageUrl(img))}
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
            if (listing.status === 'rejected') {
              showToast(t('editListing.cannotMarkSoldRejected') || 'Не можна позначати як продане відхилене оголошення', 'error');
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

      {/* Модальне вікно телефону */}
      {sellerPhone && (
        <PhoneModal
          isOpen={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          phoneNumber={sellerPhone}
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

