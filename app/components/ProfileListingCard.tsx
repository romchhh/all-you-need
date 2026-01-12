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
  onReactivate?: () => void;
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
  onReactivate,
  tg
}: ProfileListingCardProps) => {
  const { t } = useLanguage();

  // Перевіряємо статус модерації
  const isPendingModeration = listing.status === 'pending_moderation';
  const isExpired = listing.status === 'expired';
  
  // Перевіряємо чи закінчується термін дії
  const expiresAt = listing.expiresAt ? new Date(listing.expiresAt) : null;
  const now = new Date();
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 5;
  
  // Перевіряємо наявність реклами
  const hasPromotion = listing.promotionType && listing.promotionEnds;
  const promotionEndsAt = hasPromotion && listing.promotionEnds ? new Date(listing.promotionEnds) : null;
  const isPromotionActive = promotionEndsAt ? promotionEndsAt.getTime() > now.getTime() : false;
  const promotionDaysLeft = promotionEndsAt && isPromotionActive 
    ? Math.ceil((promotionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) 
    : null;

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
        isPendingModeration ? 'border-blue-300 bg-blue-50/30' :
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
              className="absolute inset-0 w-full h-full min-w-full min-h-full object-cover"
              style={{ width: '100%', height: '100%' }}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-gray-400">
              <Package size={32} />
            </div>
          )}
          
          {/* Бейдж реклами */}
          {hasPromotion && isPromotionActive && (
            <div className="absolute top-1 left-1 z-10">
              <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-lg ${
                listing.promotionType === 'vip' 
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
                  : listing.promotionType === 'top_category'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500'
                  : 'bg-gradient-to-r from-yellow-500 to-amber-500'
              }`}>
                {listing.promotionType === 'vip' && '⭐ VIP'}
                {listing.promotionType === 'top_category' && '🔝 TOP'}
                {listing.promotionType === 'highlighted' && '✨ '}
              </div>
            </div>
          )}
          
          {/* Статус */}
          {isPendingModeration && (
            <div className="absolute inset-0 bg-blue-500/70 flex items-center justify-center">
              <span className="text-white text-xs font-bold text-center px-1">⏳ {t('profile.onModeration')}</span>
            </div>
          )}
          {isSold && !isPendingModeration && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{t('listing.sold')}</span>
            </div>
          )}
          {isDeactivated && !isPendingModeration && (
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
            {expiresAt && !isExpired && (
              <div className={isExpiringSoon ? 'text-orange-600 font-semibold' : ''}>
                {t('sales.expires')}: {formatDate(expiresAt)}
                {isExpiringSoon && ` (${daysUntilExpiry} ${daysUntilExpiry === 1 ? t('profile.day') : t('profile.days')})`}
              </div>
            )}
            {isExpired && expiresAt && (
              <div className="text-red-600 font-semibold">
                Закінчилось: {formatDate(expiresAt)}
              </div>
            )}
            {/* Інформація про рекламу */}
            {hasPromotion && isPromotionActive && promotionDaysLeft !== null && (
              <div className={`font-semibold ${
                listing.promotionType === 'vip' 
                  ? 'text-purple-600' 
                  : listing.promotionType === 'top_category'
                  ? 'text-orange-600'
                  : 'text-yellow-600'
              }`}>
                📢 Реклама: {promotionDaysLeft} {promotionDaysLeft === 1 ? 'день' : promotionDaysLeft <= 4 ? 'дні' : 'днів'}
              </div>
            )}
            {hasPromotion && !isPromotionActive && (
              <div className="text-gray-400">
                📢 Реклама закінчилась
              </div>
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
          
          {/* Статус закінчення */}
          {isExpired && (
            <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs text-orange-700 font-semibold">
                ⏰ Термін дії оголошення закінчився. Натисніть "Активувати" щоб поновити (потрібна оплата).
              </p>
            </div>
          )}
          
          {/* Попередження про закінчення */}
          {isExpiringSoon && !isExpired && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700 font-semibold">
                ⚠️ Оголошення закінчується через {daysUntilExpiry} {daysUntilExpiry === 1 ? t('profile.day') : t('profile.days')}
              </p>
            </div>
          )}
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
          {!isSold && !isExpired && (
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
          
          {/* Кнопка реактивувати для закінчених, проданих і деактивованих */}
          {(isExpired || isSold || isDeactivated) && onReactivate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReactivate();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-orange-600 transition-colors"
              title="Активувати знову"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
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

