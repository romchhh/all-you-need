import { Eye, Heart, Edit2, Check, Megaphone, Package, DollarSign, Loader2 } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useMemo, useState, useEffect } from 'react';
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
  const isRejected = listing.status === 'rejected';
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
  
  // Отримуємо активні реклами через API
  const [activePromotions, setActivePromotions] = useState<string[]>([]);
  
  useEffect(() => {
    if (listing.id) {
      fetch(`/api/listings/promotions?listingId=${listing.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.activePromotions) {
            setActivePromotions(data.activePromotions);
          }
        })
        .catch(err => {
          console.error('Error fetching active promotions:', err);
          // Fallback на старий спосіб
          if (listing.promotionType) {
            setActivePromotions([listing.promotionType]);
          }
        });
    }
  }, [listing.id, listing.promotionType]);
  
  // Функція для отримання значка реклами
  const getPromotionBadge = () => {
    const promotionsToShow = activePromotions.length > 0 ? activePromotions : (listing.promotionType ? [listing.promotionType] : []);
    
    if (promotionsToShow.length === 0) return null;
    
    return (
      <>
        {promotionsToShow.map((promoType) => {
          if (promoType === 'vip') {
            return (
              <span key="vip" className="inline-flex items-center px-2 py-0.5 bg-[#D3F1A7] text-black text-xs font-bold rounded mr-1.5 whitespace-nowrap">
                VIP
              </span>
            );
          }
          if (promoType === 'top_category') {
            return (
              <span key="top" className="inline-flex items-center px-2 py-0.5 bg-[#D3F1A7] text-black text-xs font-bold rounded mr-1.5 whitespace-nowrap">
                TOP
              </span>
            );
          }
          if (promoType === 'highlighted') {
            return (
              <span key="highlighted" className="inline-flex items-center px-2 py-0.5 bg-[#D3F1A7] text-black text-xs font-bold rounded mr-1.5 whitespace-nowrap">
                {t('promotions.highlighted')}
              </span>
            );
          }
          return null;
        })}
      </>
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

  // Розраховуємо дати
  const createdDate = listing.createdAt ? new Date(listing.createdAt) : null;
  // Припускаємо, що оголошення активне 30 днів
  const expiresDate = createdDate ? new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
  
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Визначаємо стилі залежно від статусу та типу реклами
  // Правила:
  // - ТОП (top_category) - без рамки (стандартна рамка)
  // - Выделение цветом (highlighted) - рамка без тіні
  // - ВИП (vip) - рамка з тінню
  // - ТОП + Выделение - рамка (як для Выделение)
  const getCardStyles = () => {
    if (isSold) {
      return 'bg-[#000000] border-2 border-gray-600 opacity-75';
    }
    if (isRejected) {
      return 'bg-[#000000] border-2 border-red-600 opacity-75';
    }
    if (isPendingModeration) {
      return 'bg-[#000000] border-2 border-yellow-600 opacity-75';
    }
    if (isDeactivated) {
      return 'bg-[#000000] border-2 border-orange-600 opacity-75';
    }
    
    // Стилі для реклами (тільки якщо активна)
    if (hasPromotion && isPromotionActive && !isPendingModeration && !isDeactivated && !isRejected && listing.promotionType) {
      const promotionType = listing.promotionType;
      
      if (promotionType === 'vip') {
        // ВИП - рамка з тінню
        return 'bg-[#000000] border-2 border-[#D3F1A7] shadow-[0_0_20px_rgba(211,241,167,0.4)]';
      } else if (promotionType === 'highlighted') {
        // Выделение цветом - рамка без тіні
        return 'bg-[#000000] border-2 border-[#D3F1A7]';
      } else if (promotionType === 'top_category') {
        // ТОП - без рамки (стандартна рамка)
        return 'bg-[#000000] border-2 border-white/20';
      }
    }
    
    return 'bg-[#000000] border-2 border-white/20';
  };

  return (
    <div 
      className={`${getCardStyles()} rounded-2xl overflow-hidden transition-all`}
      data-listing-id={listing.id}
    >
      {/* Напівпрозора смуга зверху для статусів */}
      {(isSold || isPendingModeration || isDeactivated || isRejected) && (
        <div className={`absolute top-0 left-0 right-0 h-1 z-20 ${
          isSold ? 'bg-green-600/80' : 
          isRejected ? 'bg-red-600/80' :
          isPendingModeration ? 'bg-yellow-600/80' : 
          'bg-orange-600/80'
        }`} />
      )}
      
      <div className="flex gap-3 p-3 relative">
        {/* Бейдж "Відхилено" - у верхньому лівому куті картки (найвищий пріоритет) */}
        {isRejected && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-red-600/90 text-white text-xs font-bold rounded-full shadow-lg border border-red-400">
              {t('profile.rejected') || 'Відхилено'}
            </div>
          </div>
        )}
        
        {/* Бейдж "На модерації" - у верхньому лівому куті картки */}
        {isPendingModeration && !isRejected && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-yellow-600/90 text-white text-xs font-bold rounded-full shadow-lg border border-yellow-400">
              {t('profile.onModeration')}
            </div>
          </div>
        )}
        
        {/* Бейдж "Деактивовано" - у верхньому лівому куті картки */}
        {isDeactivated && !isPendingModeration && !isRejected && (
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-orange-600/90 text-white text-xs font-bold rounded-full shadow-lg border border-orange-400">
              {t('sales.deactivated')}
            </div>
          </div>
        )}
        
        {/* Бейдж "Продано" - у верхньому лівому куті картки */}
        {isSold && !isRejected && (
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
                isSold || isPendingModeration || isDeactivated ? 'grayscale opacity-50' : ''
              }`}
              style={{ width: '100%', height: '100%' }}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-white/20">
              <Package size={32} />
            </div>
          )}
          
          {/* Бейдж реклами - справа знизу на фото */}
          {activePromotions.length > 0 && !isPendingModeration && !isDeactivated && !isRejected && (
            <div className="absolute bottom-1 right-1 z-10 flex flex-col gap-1 items-end">
              {activePromotions.map((promoType) => {
                if (promoType === 'vip') {
                  return (
                    <div key="vip" className="px-2 py-0.5 bg-[#D3F1A7] text-black text-[10px] font-bold rounded shadow-lg">
                      VIP
                    </div>
                  );
                }
                if (promoType === 'top_category') {
                  return (
                    <div key="top" className="px-2 py-0.5 bg-[#D3F1A7] text-black text-[10px] font-bold rounded shadow-lg">
                      TOP
                    </div>
                  );
                }
                if (promoType === 'highlighted') {
                  return (
                    <div key="highlighted" className="px-2 py-0.5 bg-[#D3F1A7] text-black text-[10px] font-bold rounded shadow-lg">
                      {t('promotions.highlighted')}
                    </div>
                  );
                }
                return null;
              })}
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
                  ? 'text-gray-500 line-through' 
                  : isDeactivated
                  ? 'text-gray-500 line-through'
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
                ? 'text-gray-500 line-through' 
                : isDeactivated
                ? 'text-gray-500 line-through'
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
              <div className="mt-2 text-yellow-400 font-bold text-base flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-yellow-400" />
                <span>{t('profile.onModeration')}</span>
              </div>
            )}
            {isDeactivated && !isPendingModeration && !isSold && (
              <div className="mt-2 text-orange-400 font-bold text-base flex items-center gap-2">
                <span>✓ {t('sales.deactivated')}</span>
              </div>
            )}
          </div>

          {/* Дати */}
          <div className={`text-[10px] space-y-0.5 mt-2 ${
            isSold || isPendingModeration || isDeactivated ? 'text-gray-500' : 'text-white/70'
          }`}>
            {createdDate && (
              <div className="flex items-center gap-1">
                <span>{t('sales.created')}: {formatDate(createdDate)}</span>
              </div>
            )}
            {expiresAt && !isExpired && (
              <div className={`flex items-center gap-1 ${
                isSold || isPendingModeration || isDeactivated
                  ? 'text-gray-500' 
                  : isExpiringSoon 
                  ? 'text-orange-400 font-semibold' 
                  : ''
              }`}>
                {isPendingModeration && <Loader2 size={10} className="animate-spin text-gray-500" />}
                <span>{t('sales.expires')}: {formatDate(expiresAt)}</span>
                {isExpiringSoon && !isPendingModeration && !isSold && !isDeactivated && !isRejected && ` (${daysUntilExpiry} ${daysUntilExpiry === 1 ? t('profile.day') : t('profile.days')})`}
              </div>
            )}
            {isExpired && expiresAt && (
              <div className="text-red-400 font-semibold">
                Закінчилось: {formatDate(expiresAt)}
              </div>
            )}
            {/* Причина відхилення для відхилених оголошень */}
            {isRejected && listing.rejectionReason && (
              <div className="text-red-400 text-sm mt-1">
                <div className="font-semibold mb-1">{t('profile.rejectionReason') || 'Причина відхилення:'}</div>
                <div className="text-red-300">{listing.rejectionReason}</div>
              </div>
            )}
            {/* Інформація про рекламу */}
            {hasPromotion && isPromotionActive && promotionDaysLeft !== null && (
              <div className={`flex items-center gap-1.5 ${isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500 font-semibold' : 'text-[#D3F1A7] font-semibold'}`}>
                <span>{t('profile.promotion') || 'Реклама'}:</span>
                <span>{promotionDaysLeft} {promotionDaysLeft === 1 ? 'день' : promotionDaysLeft <= 4 ? 'дні' : 'днів'}</span>
              </div>
            )}
            {hasPromotion && !isPromotionActive && (
              <div className={isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500' : 'text-white/50'}>
                {t('profile.promotion') || 'Реклама'} закінчилась
              </div>
            )}
          </div>

          {/* Статистика */}
          <div className={`flex items-center gap-3 text-xs mt-2 ${
            isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500' : 'text-white/70'
          }`}>
            <div className="flex items-center gap-1">
              <Eye size={14} className={isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500' : ''} />
              <span>{listing.views || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart size={14} className={
                isSold || isPendingModeration || isDeactivated || isRejected
                  ? 'text-gray-500' 
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
          {/* Кнопка редагувати - прихована для проданих та заблокована для модерації */}
          {!isSold && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isPendingModeration) {
                  // Не дозволяємо редагувати оголошення на модерації
                  tg?.HapticFeedback.notificationOccurred('error');
                  return;
                }
                onEdit();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              disabled={isPendingModeration}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isPendingModeration
                  ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6] cursor-not-allowed opacity-50'
                  : isDeactivated
                  ? 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                  : 'bg-transparent border-2 border-[#D3F1A7] text-[#D3F1A7] hover:bg-[#D3F1A7]/20'
              }`}
              title={isPendingModeration ? t('editListing.cannotEditOnModeration') || 'Не можна редагувати під час модерації' : t('common.edit')}
            >
              <Edit2 size={12} />
            </button>
          )}

          {/* Кнопка відмітити як продане */}
          {!isSold && !isPendingModeration && !isRejected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsSold();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isDeactivated
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
      
      {/* Кнопка рекламувати/активувати - знизу (прихована для проданих) */}
      {!isSold && (
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
      )}
    </div>
  );
};

