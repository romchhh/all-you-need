import { Eye, Heart, Edit2, Check, Megaphone, Package, DollarSign, Loader2 } from 'lucide-react';
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

  // Визначаємо стилі залежно від статусу
  const getCardStyles = () => {
    if (isSold) {
      return 'bg-[#000000] border-2 border-gray-600 opacity-75';
    }
    if (hasPromotion && isPromotionActive && !isPendingModeration && !isDeactivated) {
      return 'bg-[#000000] border-2 border-[#D3F1A7] shadow-[0_0_20px_rgba(211,241,167,0.3)]';
    }
    return 'bg-[#000000] border-2 border-white/20';
  };

  return (
    <div 
      className={`${getCardStyles()} rounded-2xl overflow-hidden transition-all`}
    >
      <div className="flex gap-3 p-3 relative">
        {/* Значок "На модерації" - у верхньому правому куті картки */}
        {isPendingModeration && (
          <div className="absolute top-3 right-3 z-10">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#FFFFFFA6] text-black text-[9px] font-bold">
              <Loader2 size={10} className="animate-spin" />
            </div>
          </div>
        )}
        
        {/* Бейдж "Продано" - у верхньому лівому куті картки */}
        {isSold && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-green-600/90 text-white text-xs font-bold rounded-full shadow-lg border border-green-400">
              {t('listing.sold')}
            </div>
          </div>
        )}

        {/* Фото */}
        <div 
          className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-[#2A2A2A] cursor-pointer"
          onClick={() => {
            if (!isPendingModeration && !isDeactivated && !isSold) {
              onSelect(listing);
              tg?.HapticFeedback.impactOccurred('light');
            }
          }}
        >
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={listing.title}
              className={`absolute inset-0 w-full h-full min-w-full min-h-full object-cover ${
                isSold ? 'grayscale opacity-50' : isPendingModeration ? 'opacity-50' : isDeactivated ? 'opacity-65' : ''
              }`}
              style={{ width: '100%', height: '100%' }}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-white/20">
              <Package size={32} />
            </div>
          )}
        </div>

        {/* Інформація */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Верхня частина: назва + ціна */}
          <div>
            <div 
              className={`font-semibold text-sm line-clamp-2 cursor-pointer transition-colors ${
                isSold
                  ? 'text-gray-500 line-through'
                  : isPendingModeration 
                  ? 'text-[#FFFFFFA6]' 
                  : isDeactivated
                  ? 'text-[#FFFFFFA6]'
                  : 'text-white hover:text-[#D3F1A7]'
              }`}
              onClick={() => {
                if (!isPendingModeration && !isDeactivated && !isSold) {
                  onSelect(listing);
                  tg?.HapticFeedback.impactOccurred('light');
                }
              }}
            >
              {listing.title}
            </div>
            <div className={`font-bold text-base mt-1 ${
              isSold
                ? 'text-gray-500 line-through'
                : isPendingModeration 
                ? 'text-[#FFFFFFA6]' 
                : isDeactivated
                ? 'text-[#FFFFFFA6]'
                : 'text-white'
            }`}>
              {listing.isFree ? t('common.free') : `${listing.price} ${listing.currency || '$'}`}
            </div>

            {/* Статус модерації, деактивації або продажу */}
            {isSold && (
              <div className="mt-2 text-green-400 font-bold text-base flex items-center gap-2">
                <span>✓ {t('listing.sold')}</span>
              </div>
            )}
            {isPendingModeration && !isSold && (
              <div className="mt-2 text-[#FFFFFFA6] font-bold text-base flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-[#FFFFFFA6]" />
                <span>{t('profile.onModeration')}</span>
              </div>
            )}
            {isDeactivated && !isPendingModeration && !isSold && (
              <div className="mt-2 text-[#FFFFFFA6] font-bold text-base">
                {t('sales.deactivated')}
              </div>
            )}
          </div>

          {/* Дати */}
          <div className={`text-[10px] space-y-0.5 mt-2 ${
            isSold ? 'text-gray-500' : isPendingModeration || isDeactivated ? 'text-[#FFFFFFA6]' : 'text-white/70'
          }`}>
            {createdDate && (
              <div className="flex items-center gap-1">
                <span>{t('sales.created')}: {formatDate(createdDate)}</span>
              </div>
            )}
            {expiresAt && !isExpired && (
              <div className={`flex items-center gap-1 ${
                isPendingModeration 
                  ? 'text-[#FFFFFFA6]' 
                  : isExpiringSoon 
                  ? 'text-orange-400 font-semibold' 
                  : ''
              }`}>
                {isPendingModeration && <Loader2 size={10} className="animate-spin text-[#FFFFFFA6]" />}
                <span>{t('sales.expires')}: {formatDate(expiresAt)}</span>
                {isExpiringSoon && !isPendingModeration && ` (${daysUntilExpiry} ${daysUntilExpiry === 1 ? t('profile.day') : t('profile.days')})`}
              </div>
            )}
            {isExpired && expiresAt && (
              <div className="text-red-400 font-semibold">
                Закінчилось: {formatDate(expiresAt)}
              </div>
            )}
            {/* Інформація про рекламу */}
            {hasPromotion && isPromotionActive && promotionDaysLeft !== null && (
              <div className={isPendingModeration || isDeactivated ? 'text-[#FFFFFFA6] font-semibold' : 'text-[#D3F1A7] font-semibold'}>
                Реклама: {promotionDaysLeft} {promotionDaysLeft === 1 ? 'день' : promotionDaysLeft <= 4 ? 'дні' : 'днів'}
              </div>
            )}
            {hasPromotion && !isPromotionActive && (
              <div className={isPendingModeration || isDeactivated ? 'text-[#FFFFFFA6]' : 'text-white/50'}>
                Реклама закінчилась
              </div>
            )}
          </div>

          {/* Статистика */}
          <div className={`flex items-center gap-3 text-xs mt-2 ${
            isSold ? 'text-gray-500' : isPendingModeration || isDeactivated ? 'text-[#FFFFFFA6]' : 'text-white/70'
          }`}>
            <div className="flex items-center gap-1">
              <Eye size={14} className={isPendingModeration || isDeactivated ? 'text-[#FFFFFFA6]' : ''} />
              <span>{listing.views || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart size={14} className={
                isPendingModeration || isDeactivated
                  ? 'text-[#FFFFFFA6]' 
                  : isFavorite 
                  ? 'fill-[#D3F1A7] text-[#D3F1A7]' 
                  : ''
              } />
              <span>{listing.favoritesCount || 0}</span>
            </div>
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="flex flex-col gap-2 justify-center relative">
          {/* Тег реклами - над іконками */}
          {hasPromotion && isPromotionActive && !isPendingModeration && !isDeactivated && (
            <div className="absolute -top-12 right-0 z-10">
              <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded inline-block max-w-fit w-auto">
                VIP
              </div>
            </div>
          )}

          {/* Кнопка редагувати */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isPendingModeration
                ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                : isDeactivated
                ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                : 'bg-transparent border-2 border-[#D3F1A7] text-[#D3F1A7] hover:bg-[#D3F1A7]/20'
            }`}
            title={t('common.edit')}
          >
            <Edit2 size={12} />
          </button>

          {/* Кнопка відмітити як продане */}
          {!isSold && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsSold();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isPendingModeration
                  ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                  : isDeactivated
                  ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                  : 'bg-transparent border-2 border-[#D3F1A7] text-[#D3F1A7] hover:bg-[#D3F1A7]/20'
              }`}
              title={t('editListing.markAsSold')}
            >
              <DollarSign size={12} />
            </button>
          )}
        </div>
      </div>
      
      {/* Кнопка рекламувати/активувати - знизу */}
      <div className="px-3 pb-3">
        {isDeactivated && onReactivate ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReactivate();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-full bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6] rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 hover:bg-[#FFFFFFA6]/10 transition-colors font-semibold text-sm"
          >
            {t('sales.activate') || 'Активувати'}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPromote();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            disabled={isPendingModeration}
            className={`w-full rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 transition-colors font-semibold text-sm ${
              isPendingModeration
                ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6] cursor-not-allowed'
                : 'bg-[#D3F1A7] text-black hover:bg-[#D3F1A7]/90'
            }`}
          >
            <Megaphone size={16} />
            {t('sales.promote')}
          </button>
        )}
      </div>
    </div>
  );
};

