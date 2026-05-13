import { Eye, Heart, Package, MapPin } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useMemo, memo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTimeAgo } from '@/utils/formatTime';
import { getListingDisplayDate } from '@/utils/parseDbDate';
import { getCurrencySymbol } from '@/utils/currency';
import { buildListingImageUrl } from '@/utils/listingImageUrl';
import { shouldShowListingViews } from '@/utils/listingViewsDisplay';
import { useTheme } from '@/contexts/ThemeContext';

interface ListingCardColumnProps {
  listing: Listing;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
}

const ListingCardColumnComponent = ({
  listing,
  isFavorite,
  onSelect,
  onToggleFavorite,
  tg
}: ListingCardColumnProps) => {
  const { t } = useLanguage();
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
  
  // Визначаємо стилі в залежності від типу реклами
  // Лаймова рамка тільки для VIP, не для TOP
  const defaultPromoBorder = isLight ? 'border border-gray-200' : 'border border-white/20';

  const getPromotionStyles = () => {
    if (promotionTypes.length === 0) return defaultPromoBorder;

    if (promotionTypes.includes('vip')) {
      return 'border-2 border-[#3F5331] shadow-[0_0_20px_rgba(63,83,49,0.4)]';
    }

    if (promotionTypes.includes('highlighted')) {
      return 'border-2 border-[#3F5331]';
    }

    if (promotionTypes.includes('top_category')) {
      return defaultPromoBorder;
    }

    return defaultPromoBorder;
  };

  const getCardBackgroundStyles = () => {
    return isLight ? 'bg-white shadow-sm ring-1 ring-black/[0.06]' : 'bg-[#000000]';
  };
  
  const getPromotionBadge = () => {
    // Якщо є VIP - показуємо VIP бейдж
    if (promotionTypes.includes('vip')) {
      return (
        <div className="px-2.5 py-1 bg-[#3F5331] text-white text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          VIP
        </div>
      );
    }
    
    // Якщо є top_category - показуємо TOP бейдж
    if (promotionTypes.includes('top_category')) {
      return (
        <div className="px-2.5 py-1 bg-[#3F5331] text-white text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          TOP
        </div>
      );
    }
    
    return null;
  };

  const imageUrl = useMemo(() => {
    const raw = listing.image || (listing.images && listing.images.length > 0 ? listing.images[0] : '');
    return buildListingImageUrl(raw);
  }, [listing.image, listing.images]);

  const formattedTime = useMemo(() => {
    const d = getListingDisplayDate(listing);
    if (d) return formatTimeAgo(d, t);
    return listing.posted || '';
  }, [listing.createdAt, listing.publishedAt, listing.posted, t]);

  return (
    <div 
      data-listing-id={listing.id}
      className={`${getCardBackgroundStyles()} rounded-2xl overflow-hidden transition-all cursor-pointer relative ${getPromotionStyles()}`}
      onClick={() => {
        onSelect(listing);
        tg?.HapticFeedback.impactOccurred('light');
      }}
    >
      <div className="flex gap-3 p-3.5 pb-4">
        {/* Фото */}
        <div
          className={`relative w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden ${
            isLight ? 'bg-gray-100' : 'bg-[#1A1A1A]'
          }`}
        >
          {/* Бейдж реклами */}
          <div className="absolute top-3 left-3 z-10" style={{ width: 'auto', maxWidth: 'fit-content' }}>
            {getPromotionBadge()}
          </div>
          
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={listing.title}
              className="absolute inset-0 w-full h-full min-w-full min-h-full object-cover"
              style={{ width: '100%', height: '100%' }}
              loading="lazy"
            />
          ) : (
            <div
              className={`absolute inset-0 w-full h-full flex items-center justify-center ${
                isLight ? 'text-gray-300 bg-gray-100' : 'text-white/10 bg-[#1A1A1A]'
              }`}
            >
              <Package size={32} />
            </div>
          )}
        </div>

        {/* Інформація */}
        <div className="flex-1 flex flex-col justify-between min-w-0 py-0.5 relative">
          {/* Кнопка лайку справа */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(listing.id);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform active:scale-95 z-10"
          >
            <Heart
              size={18}
              className={
                isFavorite
                  ? 'text-red-500 fill-red-500'
                  : isLight
                    ? 'text-gray-500'
                    : 'text-white'
              }
              fill={isFavorite ? 'currentColor' : 'none'}
              strokeWidth={isFavorite ? 0 : 2}
            />
          </button>

          {/* Верхня частина: назва + ціна */}
          <div className="flex-1 pr-10 min-w-0">
            <div
              className={`font-semibold text-base line-clamp-2 leading-snug mb-1.5 ${
                isLight ? 'text-gray-900' : 'text-white'
              }`}
            >
              {listing.title}
            </div>
            <div className="mb-2 flex min-w-0 flex-col gap-1.5">
              {(() => {
                const isNegotiable = listing.price === t('common.negotiable') || listing.price === 'Договірна' || listing.price === 'Договорная';
                const isFree = listing.isFree;
                const fluidSize = 'text-[clamp(0.6875rem,4vw,1.125rem)]';
                if (isFree) {
                  return (
                    <span
                      className={`min-w-0 font-bold ${fluidSize} ${isLight ? 'text-[#152A12]' : 'text-white'}`}
                    >
                      {t('common.free')}
                    </span>
                  );
                }
                if (isNegotiable) {
                  return (
                    <span
                      className={`min-w-0 max-w-full truncate font-bold leading-tight whitespace-nowrap ${fluidSize} ${
                        isLight ? 'text-[#152A12]' : 'text-white'
                      }`}
                      title={t('common.negotiable')}
                    >
                      {t('common.negotiableShort')}
                    </span>
                  );
                }
                return (
                  <span
                    className={`min-w-0 max-w-full font-bold break-words text-balance [overflow-wrap:anywhere] ${fluidSize} ${
                      isLight ? 'text-[#152A12]' : 'text-white'
                    }`}
                  >
                    {`${listing.price}${getCurrencySymbol(listing.currency || 'UAH')}`}
                  </span>
                );
              })()}
              {listing.condition && (
                <span
                  className={`inline-flex max-w-full flex-shrink-0 self-start rounded px-2.5 py-1 text-[11px] font-semibold leading-tight ${
                    isLight ? 'bg-gray-200 text-gray-800' : 'bg-[#2A2A2A] text-white'
                  }`}
                >
                  {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
                </span>
              )}
            </div>
          </div>

          {/* Нижня частина: перегляди / обране, локація, час */}
          <div className="flex flex-col gap-1 text-[10px] min-w-0 mb-1">
            <div
              className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums ${
                isLight ? 'text-gray-500' : 'text-white/60'
              }`}
            >
              {shouldShowListingViews(listing.views) && (
                <span className="inline-flex items-center gap-0.5" title={t('listing.viewsLabel')}>
                  <Eye size={10} className="flex-shrink-0 opacity-80" aria-hidden />
                  {listing.views ?? 0}
                </span>
              )}
            </div>
            {listing.location && (
              <div
                className={`flex items-center gap-1.5 ${isLight ? 'text-gray-600' : 'text-white/80'}`}
              >
                <MapPin
                  size={10}
                  className={`flex-shrink-0 ${isLight ? 'text-gray-600' : 'text-white/80'}`}
                />
                <span className="line-clamp-1 truncate">{listing.location.split(',')[0]}</span>
              </div>
            )}
            {formattedTime && (
              <span className={`truncate ${isLight ? 'text-gray-500' : 'text-white/60'}`}>
                {formattedTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Мемоізуємо компонент для оптимізації - ререндериться тільки якщо змінилися пропси
export const ListingCardColumn = memo(ListingCardColumnComponent, (prevProps, nextProps) => {
  return (
    prevProps.listing.id === nextProps.listing.id &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.listing.views === nextProps.listing.views
  );
});
