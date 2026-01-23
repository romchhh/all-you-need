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
  // Лаймова рамка тільки для VIP, не для TOP
  const getPromotionStyles = () => {
    if (!promotionType) return 'border border-white/20';
    
    switch (promotionType) {
      case 'vip':
        return 'border-2 border-[#D3F1A7] shadow-[0_0_20px_rgba(211,241,167,0.4)]';
      case 'top_category':
        return 'border border-white/20';
      default:
        return 'border border-white/20';
    }
  };
  
  const getCardBackgroundStyles = () => {
    return 'bg-[#000000]';
  };
  
  const getPromotionBadge = () => {
    if (promotionType === 'vip') {
      return (
        <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          VIP
        </div>
      );
    }
    if (promotionType === 'top_category') {
      return (
        <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          TOP
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
      <div className="flex gap-3 p-3.5 pb-4">
        {/* Фото */}
        <div 
          className="relative w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-[#1A1A1A]"
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
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-white/10 bg-[#1A1A1A]">
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
          <div className="flex-1 pr-10 min-w-0">
            <div className="font-semibold text-base text-white line-clamp-2 leading-snug mb-1.5">
              {listing.title}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-white font-bold ${listing.isFree ? 'text-lg' : 'text-lg'}`}>
                {listing.isFree ? t('common.free') : `${listing.price}${getCurrencySymbol(listing.currency || 'UAH')}`}
              </span>
              {listing.condition && (
                <span className="px-2.5 py-1 bg-[#2A2A2A] text-white text-[11px] font-semibold rounded">
                  {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
                </span>
              )}
            </div>
          </div>

          {/* Нижня частина: розташування та час */}
          <div className="flex flex-col gap-1 text-[10px] min-w-0 mb-1">
            {listing.location && (
              <div className="flex items-center gap-1.5 text-white/80">
                <MapPin size={10} className="text-white/80 flex-shrink-0" />
                <span className="line-clamp-1 truncate">{listing.location.split(',')[0]}</span>
              </div>
            )}
            {formattedTime && (
              <span className="text-white/60 truncate">{formattedTime}</span>
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
