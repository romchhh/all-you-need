import { Eye, Heart, Edit2, Check, Megaphone, Package, DollarSign, Loader2 } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useMemo, useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { buildListingImageUrl } from '@/utils/listingImageUrl';
import { shouldShowListingFavorites, shouldShowListingViews } from '@/utils/listingViewsDisplay';
import { ListingAutoRenewSection } from '@/components/ListingAutoRenewSection';

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
  /** Telegram id власника для API автопродовження */
  viewerTelegramId?: string | null;
  onAutoRenewChange?: (listingId: number, autoRenew: boolean) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
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
  viewerTelegramId,
  onAutoRenewChange,
  showToast,
  tg
}: ProfileListingCardProps) => {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();

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
          // Fallback тільки якщо реклама ще активна (promotionEnds > now)
          const endsAt = listing.promotionEnds ? new Date(listing.promotionEnds) : null;
          if (listing.promotionType && endsAt && endsAt.getTime() > now.getTime()) {
            setActivePromotions(listing.promotionType.split(',').map((t: string) => t.trim()));
          }
        });
    }
  }, [listing.id, listing.promotionType, listing.promotionEnds]);
  
  // Показуємо рекламу тільки якщо вона ще активна (promotionEnds > now)
  const promotionsToShow = isPromotionActive
    ? (activePromotions.length > 0 ? activePromotions : (listing.promotionType ? listing.promotionType.split(',').map(t => t.trim()) : []))
    : [];
  
  // Функція для отримання значка реклами
  const getPromotionBadge = () => {
    if (promotionsToShow.length === 0) return null;
    
    return (
      <>
        {promotionsToShow.map((promoType: string) => {
          if (promoType === 'vip') {
            return (
              <span
                key="vip"
                className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded mr-1.5 whitespace-nowrap ${
                  isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                }`}
              >
                VIP
              </span>
            );
          }
          if (promoType === 'top_category') {
            return (
              <span
                key="top"
                className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded mr-1.5 whitespace-nowrap ${
                  isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                }`}
              >
                TOP
              </span>
            );
          }
          if (promoType === 'highlighted') {
            return (
              <span
                key="highlighted"
                className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded mr-1.5 whitespace-nowrap ${
                  isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                }`}
              >
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
    const raw = listing.image || (listing.images && listing.images.length > 0 ? listing.images[0] : '');
    return buildListingImageUrl(raw);
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
      return isLight
        ? 'bg-gray-100 border-2 border-gray-300/90 opacity-95'
        : 'bg-[#000000] border-2 border-gray-600 opacity-75';
    }
    if (isRejected) {
      return isLight
        ? 'bg-red-50/90 border-2 border-red-400/75'
        : 'bg-[#000000] border-2 border-red-600 opacity-75';
    }
    if (isPendingModeration) {
      return isLight
        ? 'bg-amber-50/95 border-2 border-amber-400/80'
        : 'bg-[#000000] border-2 border-yellow-600 opacity-75';
    }
    if (isDeactivated) {
      return isLight
        ? 'bg-orange-50/95 border-2 border-orange-400/75'
        : 'bg-[#000000] border-2 border-orange-600 opacity-75';
    }

    if (hasPromotion && isPromotionActive && !isPendingModeration && !isDeactivated && !isRejected && listing.promotionType) {
      const promotionType = listing.promotionType;

      if (promotionType === 'vip') {
        return isLight
          ? 'bg-white border-2 border-[#3F5331] shadow-[0_0_16px_rgba(63,83,49,0.22)]'
          : 'bg-[#000000] border-2 border-[#C8E6A0] shadow-[0_0_22px_rgba(200,230,160,0.45)]';
      }
      if (promotionType === 'highlighted') {
        return isLight ? 'bg-white border-2 border-[#3F5331]' : 'bg-[#000000] border-2 border-[#C8E6A0]';
      }
      if (promotionType === 'top_category') {
        return isLight ? 'bg-white border-2 border-gray-200/90 shadow-sm' : 'bg-[#000000] border-2 border-white/20';
      }
    }

    return isLight ? 'bg-white border-2 border-gray-200/90 shadow-sm' : 'bg-[#000000] border-2 border-white/20';
  };

  return (
    <div 
      className={`relative ${getCardStyles()} rounded-2xl overflow-hidden transition-all`}
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
      
      <div className="flex items-start gap-3 p-3 relative">
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

        {/* Фото + перегляди / лайки під фото */}
        <div className="flex flex-shrink-0 flex-col items-center gap-1.5">
        <div 
          className={`relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden cursor-pointer ${isLight ? 'bg-gray-200' : 'bg-[#2A2A2A]'}`}
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
            <div className={`absolute inset-0 w-full h-full flex items-center justify-center ${isLight ? 'text-gray-400' : 'text-white/20'}`}>
              <Package size={32} />
            </div>
          )}
          
          {/* Бейдж реклами - справа знизу на фото (тільки якщо реклама ще активна) */}
          {promotionsToShow.length > 0 && !isPendingModeration && !isDeactivated && !isRejected && (
            <div className="absolute bottom-1 right-1 z-10 flex flex-col gap-1 items-end">
              {promotionsToShow.map((promoType: string) => {
                if (promoType === 'vip') {
                  return (
                    <div
                      key="vip"
                      className={`px-2 py-0.5 text-[10px] font-bold rounded shadow-lg ${
                        isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                      }`}
                    >
                      VIP
                    </div>
                  );
                }
                if (promoType === 'top_category') {
                  return (
                    <div
                      key="top"
                      className={`px-2 py-0.5 text-[10px] font-bold rounded shadow-lg ${
                        isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                      }`}
                    >
                      TOP
                    </div>
                  );
                }
                if (promoType === 'highlighted') {
                  return (
                    <div
                      key="highlighted"
                      className={`px-2 py-0.5 text-[10px] font-bold rounded shadow-lg ${
                        isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                      }`}
                    >
                      {t('promotions.highlighted')}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>

        {(shouldShowListingViews(listing.views) ||
          shouldShowListingFavorites(listing.views, listing.favoritesCount)) && (
        <div
          className={`mt-1 flex w-full max-w-full flex-wrap items-center justify-center gap-2 text-[11px] leading-none ${
            isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500' : isLight ? 'text-gray-600' : 'text-white/75'
          }`}
        >
          {shouldShowListingViews(listing.views) && (
            <div className="flex items-center gap-0.5" title={t('sales.views')}>
              <Eye size={12} className={isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500' : ''} />
              <span className="tabular-nums font-medium">{listing.views || 0}</span>
            </div>
          )}
          {shouldShowListingFavorites(listing.views, listing.favoritesCount) && (
            <div
              className={`flex h-[22px] min-h-[22px] max-w-full items-center gap-0 overflow-hidden rounded-full border backdrop-blur-xl ${
                isSold || isPendingModeration || isDeactivated || isRejected
                  ? isLight
                    ? 'border-gray-200/80 bg-gray-100/90'
                    : 'border-white/10 bg-white/5'
                  : isLight
                    ? 'border-white/80 bg-white/45 text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.05),inset_0_1px_0_0_rgba(255,255,255,0.65)]'
                    : 'border-white/30 bg-black/35 text-white shadow-[0_2px_10px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)]'
              }`}
              title={t('navigation.favorites')}
            >
              <div
                className={`flex min-w-[1.1rem] items-center justify-center py-0.5 pl-1 pr-0.5 text-[10px] font-medium tabular-nums ${
                  isSold || isPendingModeration || isDeactivated || isRejected
                    ? ''
                    : isLight
                      ? 'text-neutral-900'
                      : 'text-white'
                }`}
              >
                {(listing.favoritesCount ?? 0).toLocaleString(language === 'ru' ? 'ru-RU' : 'uk-UA')}
              </div>
              <div
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-l py-0.5 ${
                  isLight ? 'border-white/50' : 'border-white/18'
                }`}
              >
                <Heart
                  size={11}
                  className={
                    isSold || isPendingModeration || isDeactivated || isRejected
                      ? 'text-gray-500'
                      : isFavorite
                        ? isLight
                          ? 'fill-[#3F5331] text-[#3F5331]'
                          : 'fill-white text-white'
                        : isLight
                          ? 'text-neutral-900'
                          : 'text-white'
                  }
                  fill={isFavorite && !(isSold || isPendingModeration || isDeactivated || isRejected) ? 'currentColor' : 'none'}
                  strokeWidth={isFavorite && !(isSold || isPendingModeration || isDeactivated || isRejected) ? 0 : 2}
                />
              </div>
            </div>
          )}
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
                  : isLight
                  ? 'text-gray-900 hover:text-[#3F5331]'
                  : 'text-white hover:text-[#C8E6A0]'
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
            <div className={`font-bold mt-1 min-w-0 ${
              isSold
                ? 'text-gray-500 line-through'
                : isPendingModeration 
                ? 'text-gray-500 line-through' 
                : isDeactivated
                ? 'text-gray-500 line-through'
                : isLight
                ? 'text-gray-900'
                : 'text-white'
            } text-[clamp(0.6875rem,4vw,1rem)]`}>
              {(() => {
                const isNegotiable = listing.price === t('common.negotiable') || listing.price === 'Договірна' || listing.price === 'Договорная';
                const isFree = listing.isFree;
                if (isFree) {
                  return t('common.free');
                }
                if (isNegotiable) {
                  return (
                    <span className="whitespace-nowrap font-bold text-[clamp(0.6875rem,4vw,1rem)]" title={t('common.negotiable')}>
                      {t('common.negotiableShort')}
                    </span>
                  );
                }
                return `${listing.price} ${listing.currency || '$'}`;
              })()}
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
            isSold || isPendingModeration || isDeactivated ? 'text-gray-500' : isLight ? 'text-gray-600' : 'text-white/70'
          }`}>
            {createdDate && (
              <div className="flex items-center gap-1">
                <span>{t('sales.created')}: {formatDate(createdDate)}</span>
              </div>
            )}
            {expiresAt && !isExpired && (
              <div className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 ${
                isSold || isPendingModeration || isDeactivated
                  ? 'text-gray-500' 
                  : isExpiringSoon 
                  ? 'text-orange-400 font-semibold' 
                  : ''
              }`}>
                {isPendingModeration && <Loader2 size={10} className="animate-spin text-gray-500 flex-shrink-0" />}
                <span className="min-w-0">{t('sales.expires')}: {formatDate(expiresAt)}</span>
                {isExpiringSoon && !isPendingModeration && !isSold && !isDeactivated && !isRejected && daysUntilExpiry != null && (
                  <span className="whitespace-nowrap">
                    ({daysUntilExpiry} {daysUntilExpiry === 1 ? t('profile.day') : daysUntilExpiry <= 4 ? t('profile.days') : t('profile.daysMany')})
                  </span>
                )}
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
              <div className={`flex items-center gap-1.5 ${isSold || isPendingModeration || isDeactivated || isRejected ? 'text-gray-500 font-semibold' : isLight ? 'text-[#3F5331] font-semibold' : 'text-[#C8E6A0] font-semibold'}`}>
                <span>{t('profile.promotion') || 'Реклама'}:</span>
                <span>{promotionDaysLeft} {promotionDaysLeft === 1 ? 'день' : promotionDaysLeft <= 4 ? 'дні' : 'днів'}</span>
              </div>
            )}
            {listing.status === 'active' &&
              !isPendingModeration &&
              !isSold &&
              !isRejected &&
              !isDeactivated &&
              viewerTelegramId && (
                <div
                  className="mt-1.5 max-w-full"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <ListingAutoRenewSection
                    compact
                    listingId={listing.id}
                    serverAutoRenew={listing.autoRenew}
                    viewerTelegramId={String(viewerTelegramId)}
                    isLight={isLight}
                    showToast={showToast ?? (() => {})}
                    onPersistSuccess={(next) => onAutoRenewChange?.(listing.id, next)}
                    tg={tg}
                  />
                </div>
              )}
          </div>
        </div>

        {/* Кнопки дій — вирівняні вгорі біля назви */}
        <div className="relative flex shrink-0 flex-col gap-2 self-start pt-0.5">
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
                  ? isLight
                    ? 'bg-transparent border-2 border-gray-300 text-gray-400 cursor-not-allowed opacity-60'
                    : 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6] cursor-not-allowed opacity-50'
                  : isDeactivated
                  ? isLight
                    ? 'bg-transparent border-2 border-gray-400 text-gray-500'
                    : 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                  : isLight
                  ? 'bg-transparent border-2 border-[#3F5331] text-[#3F5331] hover:bg-[#3F5331]/10'
                  : 'bg-transparent border-2 border-[#C8E6A0] text-[#C8E6A0] hover:bg-[#C8E6A0]/12'
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
                  ? isLight
                    ? 'bg-transparent border-2 border-gray-400 text-gray-500'
                    : 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6]'
                  : isLight
                  ? 'bg-transparent border-2 border-[#3F5331] text-[#3F5331] hover:bg-[#3F5331]/10'
                  : 'bg-transparent border-2 border-[#C8E6A0] text-[#C8E6A0] hover:bg-[#C8E6A0]/12'
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
              className={
                isLight
                  ? 'w-full bg-transparent border-2 border-gray-400 text-gray-700 rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors font-semibold text-sm'
                  : 'w-full bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6] rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 hover:bg-[#FFFFFFA6]/10 transition-colors font-semibold text-sm'
              }
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
                  ? isLight
                    ? 'bg-transparent border-2 border-gray-300 text-gray-400 cursor-not-allowed'
                    : 'bg-transparent border-2 border-[#FFFFFFA6] text-[#FFFFFFA6] cursor-not-allowed'
                  : 'bg-[#3F5331] text-white hover:bg-[#344728]'
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

