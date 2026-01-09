import { Eye, Heart, Edit2, Check, Megaphone, Package } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ProfileListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  isSold: boolean;
  isDeactivated: boolean;
  onSelect: (listing: Listing) => void;
  onEdit: () => void;
  onMarkAsSold: () => void;
  onPromote: () => void;
  tg: TelegramWebApp | null;
}

export const ProfileListingCard = ({
  listing,
  isFavorite,
  isSold,
  isDeactivated,
  onSelect,
  onEdit,
  onMarkAsSold,
  onPromote,
  tg
}: ProfileListingCardProps) => {
  const { t } = useLanguage();

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

  // Розраховуємо дати
  const createdDate = listing.createdAt ? new Date(listing.createdAt) : null;
  // Припускаємо, що оголошення активне 30 днів
  const expiresDate = createdDate ? new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
  
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div 
      className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
        isSold ? 'border-gray-300 opacity-60' : 
        isDeactivated ? 'border-orange-300' : 
        'border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex gap-3 p-3">
        {/* Фото */}
        <div 
          className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
          onClick={() => {
            onSelect(listing);
            tg?.HapticFeedback.impactOccurred('light');
          }}
        >
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={listing.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <Package size={32} />
            </div>
          )}
          
          {/* Статус */}
          {isSold && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{t('listing.sold')}</span>
            </div>
          )}
          {isDeactivated && (
            <div className="absolute inset-0 bg-orange-500/50 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{t('sales.deactivated')}</span>
            </div>
          )}
        </div>

        {/* Інформація */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Верхня частина: назва + ціна */}
          <div>
            <div 
              className="font-semibold text-sm text-gray-900 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => {
                onSelect(listing);
                tg?.HapticFeedback.impactOccurred('light');
              }}
            >
              {listing.title}
            </div>
            <div className="text-blue-600 font-bold text-base mt-1">
              {listing.isFree ? t('common.free') : `${listing.price} ${listing.currency || '₴'}`}
            </div>
          </div>

          {/* Дати */}
          <div className="text-[10px] text-gray-500 space-y-0.5">
            {createdDate && (
              <div>{t('sales.created')}: {formatDate(createdDate)}</div>
            )}
            {expiresDate && (
              <div>{t('sales.expires')}: {formatDate(expiresDate)}</div>
            )}
          </div>

          {/* Статистика */}
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <Eye size={14} />
              <span>{listing.views || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart size={14} className={isFavorite ? 'fill-red-500 text-red-500' : ''} />
              <span>{listing.favoritesCount || 0}</span>
            </div>
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="flex flex-col gap-2 justify-center">
          {/* Кнопка редагувати */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors"
            title={t('common.edit')}
          >
            <Edit2 size={14} />
          </button>

          {/* Кнопка продано */}
          {!isSold && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsSold();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
              title={t('editListing.markAsSold')}
            >
              <Check size={14} />
            </button>
          )}
        </div>
      </div>
      
      {/* Кнопка рекламувати - знизу */}
      <div className="px-3 pb-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPromote();
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full bg-purple-500 text-white rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 shadow-lg hover:bg-purple-600 transition-colors font-semibold text-sm"
        >
          <Megaphone size={16} />
          {t('sales.promote')}
        </button>
      </div>
    </div>
  );
};

