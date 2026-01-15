import { Eye, Heart, Package, MapPin } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useMemo, memo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTimeAgo } from '@/utils/formatTime';
import { getCurrencySymbol } from '@/utils/currency';

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

  // Перевіряємо чи оголошення має активну рекламу
  const hasPromotion = listing.promotionType && listing.promotionEnds 
    ? new Date(listing.promotionEnds) > new Date() 
    : false;
  
  const promotionType = hasPromotion ? listing.promotionType : null;
  
  // Визначаємо стилі в залежності від типу реклами
  const getPromotionStyles = () => {
    if (!promotionType) return 'ring-1 ring-white/30 shadow-lg shadow-white/10';
    
    switch (promotionType) {
      case 'highlighted':
        return 'ring-1 ring-yellow-400 shadow-lg shadow-yellow-100';
      case 'top_category':
        return 'ring-1 ring-orange-400 shadow-lg shadow-orange-100';
      case 'vip':
        return 'ring-2 ring-[#D3F1A7] shadow-2xl shadow-[#D3F1A7]/50';
      default:
        return 'ring-1 ring-white/30 shadow-lg shadow-white/10';
    }
  };
  
  const getCardBackgroundStyles = () => {
    return 'bg-gray-800/50';
  };
  
  const getPromotionBadge = () => {
    if (promotionType === 'vip') {
      return (
        <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-gray-800/80 rounded-full z-10">
          <span className="text-xs font-semibold text-[#D3F1A7]">VIP</span>
        </div>
      );
    }
    return null;
  };

  const imageUrl = useMemo(() => {
    if (listing.image) {
      return listing.image.startsWith('http') 
        ? listing.image 
        : `/api/images/${listing.image.startsWith('/') ? listing.image.slice(1) : listing.image}`;
    }
    if (listing.images && listing.images.length > 0) {
      const firstImage = listing.images[0];
      return firstImage.startsWith('http')
        ? firstImage
        : `/api/images/${firstImage.startsWith('/') ? firstImage.slice(1) : firstImage}`;
    }
    return '';
  }, [listing.image, listing.images]);

  const formattedTime = useMemo(() => {
    if (listing.createdAt) {
      return formatTimeAgo(listing.createdAt, t);
    }
    return listing.posted || '';
  }, [listing.createdAt, listing.posted, t]);

  return (
    <div 
      data-listing-id={listing.id}
      className={`${getCardBackgroundStyles()} rounded-2xl overflow-hidden transition-all cursor-pointer relative ${getPromotionStyles()}`}
      onClick={() => {
        onSelect(listing);
        tg?.HapticFeedback.impactOccurred('light');
      }}
    >
      <div className="flex gap-3 p-3.5">
        {/* Фото */}
        <div 
          className="relative w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-gray-700"
        >
          {/* Бейдж реклами */}
          {getPromotionBadge()}
          
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={listing.title}
              className="absolute inset-0 w-full h-full min-w-full min-h-full object-cover"
              style={{ width: '100%', height: '100%' }}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-gray-400 bg-gray-700">
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
              className={isFavorite ? 'text-black fill-black' : 'text-white'}
              fill={isFavorite ? 'currentColor' : 'none'}
              strokeWidth={isFavorite ? 0 : 2}
            />
          </button>

          {/* Верхня частина: назва + ціна */}
          <div className="flex-1 pr-10">
            <div className="font-semibold text-base text-white line-clamp-2 leading-snug mb-2">
              {listing.title}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#D3F1A7] font-bold text-lg">
                {listing.isFree ? t('common.free') : `${listing.price}${getCurrencySymbol(listing.currency || 'UAH')}`}
              </span>
              {listing.condition && (
                <span className="px-2 py-0.5 bg-gray-700/50 text-white text-xs font-medium rounded-full">
                  {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
                </span>
              )}
            </div>
          </div>

          {/* Нижня частина: розташування та час */}
          <div className="flex items-center justify-between text-xs text-white/80">
            {listing.location && (
              <div className="flex items-center gap-1">
                <MapPin size={12} className="text-white/80" />
                <span className="line-clamp-1">{listing.location.split(',')[0]}</span>
              </div>
            )}
            {formattedTime && (
              <span className="text-white/60">{formattedTime}</span>
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
    prevProps.listing.views === nextProps.listing.views &&
    prevProps.listing.favoritesCount === nextProps.listing.favoritesCount
  );
});
