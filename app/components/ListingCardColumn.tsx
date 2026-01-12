import { Eye, Heart, Package } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useMemo, memo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTimeAgo } from '@/utils/formatTime';

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
    if (!promotionType) return 'border-gray-200 hover:border-blue-300';
    
    switch (promotionType) {
      case 'highlighted':
        return 'border-yellow-400 ring-1 ring-yellow-300 shadow-md shadow-yellow-100';
      case 'top_category':
        return 'border-orange-400 ring-1 ring-orange-300 shadow-md shadow-orange-100';
      case 'vip':
        return 'border-purple-500 ring-1 ring-purple-400 shadow-lg shadow-purple-200';
      default:
        return 'border-gray-200 hover:border-blue-300';
    }
  };
  
  const getCardBackgroundStyles = () => {
    if (!promotionType) return 'bg-white';
    
    switch (promotionType) {
      case 'highlighted':
        return 'bg-gradient-to-br from-yellow-50 via-white to-white';
      case 'top_category':
        return 'bg-gradient-to-br from-orange-50 via-white to-white';
      case 'vip':
        return 'bg-gradient-to-br from-purple-50 via-pink-50 to-white';
      default:
        return 'bg-white';
    }
  };
  
  const getPromotionBadge = () => {
    if (!promotionType) return null;
    
    const badges = {
      highlighted: { text: '⭐', color: 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' },
      top_category: { text: '🔥', color: 'bg-gradient-to-r from-orange-500 to-red-500 text-white' },
      vip: { text: '👑', color: 'bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white' },
    };
    
    const badge = badges[promotionType as keyof typeof badges];
    if (!badge) return null;
    
    return (
      <div className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-xs ${badge.color} shadow-sm z-10`}>
        {badge.text}
      </div>
    );
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
      className={`${getCardBackgroundStyles()} rounded-2xl border-2 overflow-hidden transition-all cursor-pointer ${getPromotionStyles()} ${promotionType ? 'my-2' : ''}`}
      onClick={() => {
        onSelect(listing);
        tg?.HapticFeedback.impactOccurred('light');
      }}
    >
      <div className="flex gap-3 p-3.5">
        {/* Фото */}
        <div 
          className="relative w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100"
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
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
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
            className="absolute top-0 right-0 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform active:scale-95 z-10"
          >
            <Heart 
              size={18} 
              className={isFavorite ? 'text-red-500' : 'text-gray-600'}
              fill={isFavorite ? 'currentColor' : 'none'}
            />
          </button>

          {/* Верхня частина: назва + ціна */}
          <div className="flex-1 pr-10">
            <div className="font-semibold text-base text-gray-900 line-clamp-2 leading-snug mb-1.5">
              {listing.title}
            </div>
            <div className="text-blue-600 font-bold text-lg mb-2">
              {listing.isFree ? t('common.free') : `${listing.price} ${listing.currency || '₴'}`}
            </div>
          </div>

          {/* Нижня частина: розташування, час, статистика */}
          <div className="flex flex-col gap-1.5">
            {/* Розташування та час */}
            <div className="text-xs text-gray-500 space-y-0.5">
              {listing.location && (
                <div className="line-clamp-1 font-medium">{listing.location}</div>
              )}
              {formattedTime && (
                <div>{formattedTime}</div>
              )}
            </div>

            {/* Статистика */}
            <div className="flex items-center gap-4 text-xs text-gray-600 pt-1">
              <div className="flex items-center gap-1.5">
                <Eye size={15} className="text-gray-500" />
                <span className="font-medium">{listing.views || 0}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(listing.id);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
              >
                <Heart size={15} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-500'} />
                <span className="font-medium">{listing.favoritesCount || 0}</span>
              </button>
            </div>
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
