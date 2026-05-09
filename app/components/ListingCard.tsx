import { Heart, Image as ImageIcon } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTimeAgo } from '@/utils/formatTime';
import { getListingDisplayDate } from '@/utils/parseDbDate';
import { getCategories } from '@/constants/categories';
import { getListingCategoryLabel } from '@/utils/listingCategoryLabel';
import { buildListingImageUrl } from '@/utils/listingImageUrl';
import { useTheme } from '@/contexts/ThemeContext';

interface ListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
  isSold?: boolean;
  isDeactivated?: boolean;
  /** `stacked` — завжди вертикальна картка як на мобільному (для горизонтальних каруселей на десктопі). */
  layout?: 'responsive' | 'stacked';
}

const ListingCardComponent = ({
  listing,
  isFavorite,
  onSelect,
  onToggleFavorite,
  tg,
  isSold = false,
  isDeactivated = false,
  layout = 'responsive',
}: ListingCardProps) => {
  const isStacked = layout === 'stacked';
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const categories = useMemo(() => getCategories(t), [t]);
  const categoryLabel = useMemo(
    () => getListingCategoryLabel(categories, listing.category, listing.subcategory, t),
    [categories, listing.category, listing.subcategory, t]
  );
  
  // Перевіряємо чи оголошення має активну рекламу
  const hasPromotion = listing.promotionType && listing.promotionEnds 
    ? new Date(listing.promotionEnds) > new Date() 
    : false;
  
  // Парсимо promotionType - може бути одним типом або комбінацією "highlighted,top_category"
  const promotionTypes = hasPromotion && listing.promotionType
    ? listing.promotionType.split(',').map(t => t.trim())
    : [];
  
  const promotionType = promotionTypes.length > 0 ? promotionTypes[0] : null;
  
  // Логування для діагностики
  useEffect(() => {
    if (listing.promotionType) {
      console.log('Listing promotion data:', {
        id: listing.id,
        promotionType: listing.promotionType,
        promotionEnds: listing.promotionEnds,
        hasPromotion,
        now: new Date().toISOString(),
        endsAt: listing.promotionEnds ? new Date(listing.promotionEnds).toISOString() : null,
        isExpired: listing.promotionEnds ? new Date(listing.promotionEnds) <= new Date() : null
      });
    }
  }, [listing.id, listing.promotionType, listing.promotionEnds]);
  
  // Визначаємо стилі в залежності від типу реклами
  // Правила:
  // - ТОП (top_category) - без рамки (тільки бейдж, якщо немає іншої реклами)
  // - Выделение цветом (highlighted) - рамка без бейджа
  // - ВИП (vip) - рамка + бейдж VIP
  // - ТОП + Выделение - рамка + бейдж TOP
  const defaultPromoBorder = isLight ? 'border border-gray-200' : 'border border-white/20';

  const getPromotionStyles = () => {
    if (promotionTypes.length === 0) return defaultPromoBorder;

    if (promotionTypes.includes('vip')) {
      return 'border-2 border-[#D3F1A7] shadow-[0_0_20px_rgba(211,241,167,0.4)]';
    }

    if (promotionTypes.includes('highlighted')) {
      return 'border-2 border-[#D3F1A7]';
    }

    if (promotionTypes.includes('top_category')) {
      return defaultPromoBorder;
    }

    return defaultPromoBorder;
  };
  
  const getPromotionBadge = () => {
    // Якщо є VIP - показуємо VIP бейдж
    if (promotionTypes.includes('vip')) {
      return (
        <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          VIP
        </div>
      );
    }
    
    // Якщо є top_category - показуємо TOP бейдж
    if (promotionTypes.includes('top_category')) {
      return (
        <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          TOP
        </div>
      );
    }
    
    // highlighted - без бейджа (тільки рамка)
    return null;
  };
  
  const getCardBackgroundStyles = () => {
    return isLight ? 'bg-white shadow-sm ring-1 ring-black/[0.06]' : 'bg-[#000000]';
  };
  
  // Форматуємо час на клієнті з перекладами
  const formattedTime = useMemo(() => {
    const d = getListingDisplayDate(listing);
    if (d) return formatTimeAgo(d, t);
    return listing.posted || '';
  }, [listing.createdAt, listing.publishedAt, listing.posted, t]);
  const imageLoadedRef = useRef<Set<string>>(new Set());
  
  // Перевіряємо, чи зображення вже завантажене при ініціалізації
  const checkIfImageLoaded = (url: string): boolean => {
    if (!url) return false;
    if (imageLoadedRef.current.has(url)) return true;
    
    // Перевіряємо кеш браузера
    const img = new Image();
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      imageLoadedRef.current.add(url);
      return true;
    }
    return false;
  };

  // Мемоізуємо URL зображення, щоб уникнути зайвих запитів
  const imageUrl = useMemo(() => {
    const image = listing.image || (listing.images && listing.images.length > 0 ? listing.images[0] : '');
    return buildListingImageUrl(image);
  }, [listing.image, listing.images]);

  // Ініціалізуємо стан завантаження на основі того, чи зображення вже завантажене
  const [imageLoading, setImageLoading] = useState(() => {
    if (!imageUrl) return false;
    return !checkIfImageLoaded(imageUrl);
  });
  const [imageError, setImageError] = useState(false);

  // Скидаємо стан завантаження при зміні URL зображення
  useEffect(() => {
    if (!imageUrl) {
      setImageLoading(false);
      setImageError(true);
      return;
    }
    
    // Перевіряємо, чи це зображення вже було завантажене раніше
    if (imageLoadedRef.current.has(imageUrl)) {
      setImageLoading(false);
      setImageError(false);
      return;
    }
    
    // Перевіряємо, чи зображення вже в кеші браузера
    const img = new Image();
    let isCancelled = false;
    
    img.onload = () => {
      if (!isCancelled) {
        imageLoadedRef.current.add(imageUrl);
        setImageLoading(false);
        setImageError(false);
      }
    };
    img.onerror = () => {
      if (!isCancelled) {
        setImageLoading(false);
        setImageError(true);
      }
    };
    
    // Встановлюємо src для перевірки кешу
    img.src = imageUrl;
    
    // Якщо зображення вже в кеші, воно завантажиться миттєво
    if (img.complete && img.naturalWidth > 0) {
      imageLoadedRef.current.add(imageUrl);
      setImageLoading(false);
      setImageError(false);
    } else {
      // Зображення ще не завантажене
      setImageLoading(true);
      setImageError(false);
    }
    
    return () => {
      isCancelled = true;
    };
  }, [imageUrl]);

  return (
    <div 
      data-listing-id={listing.id}
      className={`${getCardBackgroundStyles()} rounded-2xl transition-all cursor-pointer relative select-none flex h-full min-h-0 ${
        isStacked
          ? 'flex-col overflow-hidden'
          : 'flex-col lg:flex-row lg:items-stretch lg:overflow-hidden'
      } ${isSold || isDeactivated ? 'opacity-60' : ''} ${getPromotionStyles()}`}
      onClick={() => {
        if (!isSold && !isDeactivated) {
          onSelect(listing);
          tg?.HapticFeedback.impactOccurred('light');
        }
      }}
    >
      {/* Зображення: зверху на мобільному, зліва на десктопі */}
      <div
        className={
          isStacked
            ? 'relative z-[1] h-[220px] w-full shrink-0 overflow-hidden rounded-t-2xl sm:h-[240px]'
            : 'relative z-[1] h-[220px] w-full shrink-0 overflow-hidden rounded-t-2xl sm:h-[240px] lg:h-full lg:min-h-[220px] lg:w-52 lg:self-stretch lg:rounded-l-2xl lg:rounded-t-none lg:rounded-tr-none xl:w-56'
        }
      >
        {/* Бейдж реклами (VIP/TOP) - лівий верхній кут */}
        <div className="absolute top-3 left-3 z-10" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          {getPromotionBadge()}
        </div>
        
        {/* Placeholder або зображення */}
        {imageError || (!listing.image && (!listing.images || listing.images.length === 0)) ? (
          <div className={`absolute inset-0 flex items-center justify-center w-full h-full ${isLight ? 'bg-gray-100' : 'bg-[#1A1A1A]'}`}>
            <div className="text-center">
              <ImageIcon size={48} className={`mx-auto ${isLight ? 'text-gray-300' : 'text-white/10'}`} />
            </div>
          </div>
        ) : (
          <img 
            src={imageUrl}
            alt={listing.title}
            className={`absolute inset-0 w-full h-full min-w-full min-h-full object-cover ${
              imageLoading ? 'opacity-0 transition-opacity duration-300' : 'opacity-100'
            } ${isSold || isDeactivated ? 'grayscale' : ''}`}
            style={{ width: '100%', height: '100%' }}
            loading="lazy"
            decoding="async"
            sizes={isStacked ? '(max-width: 1023px) 50vw, 240px' : '(max-width: 1023px) 50vw, 25vw'}
            key={`${listing.image}-${listing.id}`}
            onLoad={() => {
              imageLoadedRef.current.add(imageUrl);
              setImageLoading(false);
              setImageError(false);
            }}
            onError={(e) => {
              setImageLoading(false);
              setImageError(true);
              console.error('Error loading listing image:', listing.image);
            }}
          />
        )}
        
        {/* Бейдж "Продано" або "Деактивовано" */}
        {isSold && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-2 py-1 bg-gray-800/90 text-white text-xs font-semibold rounded-full shadow-md">
              {t('listing.sold')}
            </span>
          </div>
        )}
        {isDeactivated && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-2 py-1 bg-orange-600/90 text-white text-xs font-semibold rounded-full shadow-md">
              {t('sales.deactivated')}
            </span>
          </div>
        )}
        
        {/* Кнопка лайку - правий верхній кут */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className={`absolute top-2 right-2 w-8 h-8 flex items-center justify-center backdrop-blur-sm rounded-full transition-all z-10 ${
            isLight
              ? 'bg-white/80 border border-gray-300/80 hover:bg-white'
              : 'bg-black/40 border border-white/30 hover:bg-black/60'
          }`}
        >
          <Heart 
            size={16} 
            className={
              isFavorite
                ? isLight
                  ? 'text-red-500 fill-red-500'
                  : 'text-white fill-white'
                : isLight
                  ? 'text-gray-600'
                  : 'text-white'
            }
            fill={isFavorite ? 'currentColor' : 'none'}
            strokeWidth={isFavorite ? 0 : 2}
          />
        </button>
      </div>
      
      {/* Інфо-блок: знизу на мобільному, справа на десктопі */}
      <div
        className={`relative z-30 flex min-h-0 flex-1 flex-col px-4 pb-2 pt-3 -mt-5 rounded-t-3xl rounded-b-2xl ${
          isStacked
            ? ''
            : 'lg:mt-0 lg:rounded-none lg:rounded-r-2xl lg:rounded-bl-2xl lg:justify-center lg:py-4 lg:pl-5'
        } ${
          isLight
            ? 'bg-gradient-to-b from-white to-gray-50'
            : 'bg-gradient-to-b from-[#1A1A1A]/95 to-[#0A0A0A]/95'
        }`}
      >
        {/* Ціна + стан: в ряд на мобільних; з lg (горизонтальна картка) — колонка, щоб бейдж не стискав ціну */}
        <div
          className={`mb-1 flex min-w-0 flex-row items-start justify-between gap-2 ${
            isStacked ? '' : 'lg:flex-col lg:items-stretch lg:gap-1.5'
          }`}
        >
          <div className={`min-w-0 flex-1 ${isStacked ? '' : 'lg:w-full lg:flex-none'}`}>
          {(() => {
            const isNegotiable = listing.price === t('common.negotiable') || listing.price === 'Договірна' || listing.price === 'Договорная';
            const isFree = listing.isFree;
            const priceClass = `block font-bold text-balance break-words [overflow-wrap:anywhere] ${isLight ? 'text-[#3F5331]' : 'text-white'}`;
            const fluidSize = isStacked
              ? 'text-[clamp(0.6875rem,4vw,1.5rem)] sm:max-w-full'
              : 'text-[clamp(0.6875rem,4vw,1.5rem)] sm:max-w-full lg:text-xl xl:text-2xl';
            if (isFree) {
              return <span className={`${priceClass} ${fluidSize}`}>{t('common.free')}</span>;
            }
            if (isNegotiable) {
              return (
                <span
                  className={`block min-w-0 truncate font-bold leading-none tracking-tight whitespace-nowrap text-[clamp(0.5rem,2.6vw,0.8125rem)] sm:text-[clamp(0.5625rem,2.2vw,0.875rem)] ${
                    isStacked ? '' : 'lg:text-[clamp(0.625rem,1.1vw,0.8125rem)]'
                  } ${isLight ? 'text-[#3F5331]' : 'text-white'}`}
                  title={t('common.negotiable')}
                >
                  {t('common.negotiableShort')}
                </span>
              );
            }
            return (
              <span className={`${priceClass} ${fluidSize}`}>
                {`${listing.price}${getCurrencySymbol(listing.currency)}`}
              </span>
            );
          })()}
          </div>
          {listing.condition && (
            <span
              className={`inline-flex max-w-full flex-shrink-0 self-start rounded px-2.5 py-1 text-[11px] font-semibold leading-tight lg:self-start ${
                isLight ? 'bg-gray-200 text-gray-800' : 'bg-[#2A2A2A] text-white'
              }`}
            >
              {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
            </span>
          )}
        </div>
        
        {/* Назва товару */}
        <p
          className={`text-sm line-clamp-2 mb-0.5 font-medium leading-snug ${
            isStacked ? '' : 'lg:text-[15px]'
          } ${isLight ? 'text-gray-900' : 'text-white'}`}
        >
          {listing.title}
        </p>

        {categoryLabel && (
          <div className={`text-[11px] truncate mt-1 ${isLight ? 'text-gray-600' : 'text-white/70'}`}>
            {categoryLabel}
          </div>
        )}

        <div
          className={`flex flex-col gap-0.5 text-[10px] mt-0.5 mb-0 ${
            isLight ? 'text-gray-500' : 'text-white/60'
          }`}
        >
          <div className="flex items-center gap-1">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`flex-shrink-0 ${isLight ? 'text-gray-500' : 'text-white/60'}`}
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span className="truncate">{listing.location?.split(',')[0] || ''}</span>
          </div>
          <div className="truncate">{formattedTime}</div>
        </div>
      </div>
    </div>
  );
};

// Мемоізуємо компонент для оптимізації ререндерів
export const ListingCard = memo(ListingCardComponent, (prevProps, nextProps) => {
  // Перевіряємо, чи змінилися важливі пропси
  return (
    prevProps.listing.id === nextProps.listing.id &&
    prevProps.listing.image === nextProps.listing.image &&
    prevProps.listing.price === nextProps.listing.price &&
    prevProps.listing.title === nextProps.listing.title &&
    prevProps.listing.promotionType === nextProps.listing.promotionType &&
    prevProps.listing.promotionEnds === nextProps.listing.promotionEnds &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.isSold === nextProps.isSold &&
    prevProps.isDeactivated === nextProps.isDeactivated &&
    prevProps.layout === nextProps.layout
  );
});
