import { Heart, Image as ImageIcon, Eye } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useMemo, useEffect, memo } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTimeAgo } from '@/utils/formatTime';
import { getListingDisplayDate } from '@/utils/parseDbDate';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { isPriceChangeFresh } from '@/lib/listings/priceChangeDisplay';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { shouldShowListingViews } from '@/lib/listings/viewsDisplay';
import { displayListingFavoritesCount, displayListingViews } from '@/lib/listings/displayStats';
import { useTheme } from '@/contexts/ThemeContext';

interface ListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
  /** Перші картки above-the-fold — eager + high fetch priority */
  priority?: boolean;
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
  priority = false,
}: ListingCardProps) => {
  const isStacked = layout === 'stacked';
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  
  // Перевіряємо чи оголошення має активну рекламу
  const hasPromotion = listing.promotionType && listing.promotionEnds 
    ? new Date(listing.promotionEnds) > new Date() 
    : false;
  
  // Парсимо promotionType - може бути одним типом або комбінацією "highlighted,top_category"
  const promotionTypes = hasPromotion && listing.promotionType
    ? listing.promotionType.split(',').map(t => t.trim())
    : [];
  
  const promotionType = promotionTypes.length > 0 ? promotionTypes[0] : null;
  
  // Логування для діагностики — вимкнено в prod
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !listing.promotionType) return;
    console.log('Listing promotion data:', {
      id: listing.id,
      promotionType: listing.promotionType,
      promotionEnds: listing.promotionEnds,
      hasPromotion,
      now: new Date().toISOString(),
      endsAt: listing.promotionEnds ? new Date(listing.promotionEnds).toISOString() : null,
      isExpired: listing.promotionEnds ? new Date(listing.promotionEnds) <= new Date() : null,
    });
  }, [listing.id, listing.promotionType, listing.promotionEnds, hasPromotion]);
  
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
      return isLight
        ? 'border-2 border-[#3F5331] shadow-[0_0_20px_rgba(63,83,49,0.35)]'
        : 'border-2 border-[#C8E6A0] shadow-[0_0_22px_rgba(200,230,160,0.45)]';
    }

    if (promotionTypes.includes('highlighted')) {
      return isLight ? 'border-2 border-[#3F5331]' : 'border-2 border-[#C8E6A0]';
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
        <div
          className={`px-2.5 py-1 text-xs font-bold rounded whitespace-nowrap ${
            isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
          }`}
          style={{ width: 'auto', maxWidth: 'fit-content' }}
        >
          VIP
        </div>
      );
    }
    
    // Якщо є top_category - показуємо TOP бейдж
    if (promotionTypes.includes('top_category')) {
      return (
        <div
          className={`px-2.5 py-1 text-xs font-bold rounded whitespace-nowrap ${
            isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
          }`}
          style={{ width: 'auto', maxWidth: 'fit-content' }}
        >
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
  const shownViews = useMemo(
    () => displayListingViews(listing),
    [listing.views, listing.createdAt, listing.publishedAt, listing.posted]
  );
  const shownFavorites = useMemo(
    () => displayListingFavoritesCount(listing),
    [listing.favoritesCount, listing.createdAt, listing.publishedAt, listing.posted]
  );

  const imageUrl = useMemo(() => {
    return resolveListingCardImageUrl(listing);
  }, [listing.thumbUrl, listing.image, listing.images, listing.category]);

  const [imageError, setImageError] = useState(!imageUrl);

  useEffect(() => {
    if (!imageUrl) {
      setImageError(true);
      return;
    }
    setImageError(false);
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
        {imageError || !imageUrl ? (
          <div className={`absolute inset-0 flex items-center justify-center w-full h-full ${isLight ? 'bg-gray-100' : 'bg-[#1A1A1A]'}`}>
            <div className="text-center">
              <ImageIcon size={48} className={`mx-auto ${isLight ? 'text-gray-300' : 'text-white/10'}`} />
            </div>
          </div>
        ) : (
          <CachedListingImage
            src={imageUrl}
            alt={listing.title}
            className={`absolute inset-0 w-full h-full min-w-full min-h-full object-cover ${
              isSold || isDeactivated ? 'grayscale' : ''
            }`}
            style={{ width: '100%', height: '100%' }}
            priority={priority}
            sizes={isStacked ? '(max-width: 1023px) 50vw, 240px' : '(max-width: 1023px) 50vw, 25vw'}
            key={`${imageUrl}-${listing.id}`}
            onError={() => {
              setImageError(true);
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
        
        {(() => {
          const favCount = shownFavorites;
          const filledHeart =
            isFavorite
              ? isLight
                ? 'text-[#3F5331] fill-[#3F5331]'
                : 'text-white fill-white'
              : isLight
                ? 'text-gray-600'
                : 'text-white';

          if (favCount === 0) {
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(listing.id);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-all ${
                  isLight
                    ? 'border border-gray-300/80 bg-white/80 hover:bg-white'
                    : 'border border-white/30 bg-black/40 hover:bg-black/60'
                }`}
                aria-pressed={isFavorite}
                aria-label={t('navigation.favorites')}
              >
                <Heart
                  size={16}
                  className={filledHeart}
                  fill={isFavorite ? 'currentColor' : 'none'}
                  strokeWidth={isFavorite ? 0 : 2}
                />
              </button>
            );
          }

          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(listing.id);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`absolute top-2 right-2 z-10 flex h-7 min-h-7 items-center gap-0 overflow-hidden rounded-full border px-0 text-left backdrop-blur-xl transition-[transform,box-shadow] active:scale-[0.98] ${
                isLight
                  ? 'border-white/80 bg-white/45 text-neutral-900 shadow-[0_2px_16px_rgba(0,0,0,0.07),inset_0_1px_0_0_rgba(255,255,255,0.75)] hover:bg-white/55'
                  : 'border-white/35 bg-black/35 text-white shadow-[0_2px_12px_rgba(0,0,0,0.32),inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:bg-black/45'
              }`}
              aria-pressed={isFavorite}
              aria-label={t('navigation.favorites')}
            >
              <span
                className={`min-w-[1.25rem] shrink-0 pl-2 pr-0.5 text-[11px] font-medium tabular-nums leading-none ${
                  isLight ? 'text-neutral-900' : 'text-white'
                }`}
              >
                {favCount.toLocaleString(language === 'ru' ? 'ru-RU' : 'uk-UA')}
              </span>
              <span
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center border-l ${
                  isLight ? 'border-white/55' : 'border-white/20'
                }`}
              >
                <Heart
                  size={14}
                  className={filledHeart}
                  fill={isFavorite ? 'currentColor' : 'none'}
                  strokeWidth={isFavorite ? 0 : 2}
                />
              </span>
            </button>
          );
        })()}
      </div>
      
      {/* Інфо-блок: знизу на мобільному, справа на десктопі */}
      <div
        className={`relative z-30 flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3 -mt-5 rounded-t-3xl rounded-b-2xl sm:px-4 ${
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
            const priceClass = `block font-bold text-balance break-words [overflow-wrap:anywhere] ${isLight ? 'text-[#152A12]' : 'text-white'}`;
            const fluidSize = isStacked
              ? 'text-[clamp(0.6875rem,4vw,1.5rem)] sm:max-w-full'
              : 'text-[clamp(0.6875rem,4vw,1.5rem)] sm:max-w-full lg:text-xl xl:text-2xl';
            const showPrev =
              !!listing.previousPrice &&
              isPriceChangeFresh(listing.priceChangedAt) &&
              listing.previousPrice !== listing.price;
            const prevEl = showPrev ? (
              <span
                className={`mr-1.5 text-[0.7em] font-medium line-through opacity-60 ${
                  isLight ? 'text-gray-500' : 'text-white/50'
                }`}
              >
                {listing.previousPrice === 'Free' || listing.previousPrice === t('common.free')
                  ? t('common.free')
                  : `${listing.previousPrice}${getCurrencySymbol(listing.currency)}`}
              </span>
            ) : null;
            if (isFree) {
              return (
                <span className={`${priceClass} ${fluidSize}`}>
                  {prevEl}
                  {t('common.free')}
                </span>
              );
            }
            if (isNegotiable) {
              return (
                <span
                  className={`block min-w-0 truncate font-bold leading-tight whitespace-nowrap ${fluidSize} ${
                    isLight ? 'text-[#152A12]' : 'text-white'
                  }`}
                  title={t('common.negotiable')}
                >
                  {prevEl}
                  {t('common.negotiableShort')}
                </span>
              );
            }
            return (
              <span className={`${priceClass} ${fluidSize}`}>
                {prevEl}
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

        <div
          className={`flex flex-col gap-0.5 text-[10px] mt-0.5 mb-0 ${
            isLight ? 'text-gray-500' : 'text-white/60'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0">
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
          <div className="flex min-w-0 items-center justify-between gap-2 tabular-nums">
            <span className="min-w-0 truncate">{formattedTime}</span>
            {shouldShowListingViews(shownViews) && (
              <span className="inline-flex shrink-0 items-center gap-0.5" title={t('listing.viewsLabel')}>
                <Eye size={10} className="flex-shrink-0 opacity-80" aria-hidden />
                {shownViews}
              </span>
            )}
          </div>
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
    prevProps.listing.previousPrice === nextProps.listing.previousPrice &&
    prevProps.listing.priceChangedAt === nextProps.listing.priceChangedAt &&
    prevProps.listing.title === nextProps.listing.title &&
    prevProps.listing.promotionType === nextProps.listing.promotionType &&
    prevProps.listing.promotionEnds === nextProps.listing.promotionEnds &&
    prevProps.listing.views === nextProps.listing.views &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.isSold === nextProps.isSold &&
    prevProps.isDeactivated === nextProps.isDeactivated &&
    prevProps.layout === nextProps.layout &&
    prevProps.priority === nextProps.priority
  );
});
