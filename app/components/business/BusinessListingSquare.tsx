'use client';

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Edit2, Heart, Megaphone, RotateCcw, Send } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { listingDistributeButtonClass } from '@/lib/ui/listingDistributeCta';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { ListingAutoCover } from '@/components/listing/ListingAutoCover';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { getCurrencySymbol } from '@/utils/currency';

interface BusinessListingSquareProps {
  listing: Listing;
  onSelect: (listing: Listing) => void;
  tg: TelegramWebApp | null;
  isFavorite?: boolean;
  onToggleFavorite?: (id: number) => void;
  onEdit?: () => void;
  onMarkAsSold?: () => void;
  onReactivate?: () => void;
  onPromote?: () => void;
  onDistribute?: () => void;
}

function priceLabel(listing: Listing, t: (key: string) => string) {
  if (listing.isFree) return t('common.free');
  const negotiable =
    listing.price === t('common.negotiable') ||
    listing.price === 'Договірна' ||
    listing.price === 'Договорная';
  if (negotiable) return t('common.negotiableShort');
  return `${listing.price}${getCurrencySymbol(listing.currency)}`;
}

export function BusinessListingSquare({
  listing,
  onSelect,
  tg,
  isFavorite = false,
  onToggleFavorite,
  onEdit,
  onMarkAsSold,
  onReactivate,
  onPromote,
  onDistribute,
}: BusinessListingSquareProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const imageUrl = useMemo(() => resolveListingCardImageUrl(listing), [listing]);
  const [imageError, setImageError] = useState(!imageUrl);

  useEffect(() => {
    setImageError(!imageUrl);
  }, [imageUrl]);

  const isSold = listing.status === 'sold';
  const isRejected = listing.status === 'rejected';
  const isPending = listing.status === 'pending_moderation';
  const isExpired = listing.status === 'expired';
  const isDeactivated =
    listing.status === 'hidden' || (listing.status as string) === 'deactivated' || isExpired;
  const dimmed = isSold || isRejected || isPending || isDeactivated;

  const statusLabel = isSold
    ? t('listing.sold')
    : isRejected
      ? t('profile.rejected') || 'Відхилено'
      : isPending
        ? t('profile.onModeration')
        : isExpired
          ? t('sales.deactivated')
          : isDeactivated
            ? t('sales.deactivated')
            : null;

  const isActive = listing.status === 'active';
  const showDistribute = Boolean(onDistribute && isActive && !isSold && !isPending && !isRejected);

  const openListing = () => {
    if (dimmed && (onEdit || onMarkAsSold || onReactivate || onPromote || onDistribute)) return;
    onSelect(listing);
    tg?.HapticFeedback.impactOccurred('light');
  };

  const square = (
    <div
      role="button"
      tabIndex={0}
      onClick={openListing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openListing();
        }
      }}
      className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-black/10 text-left"
    >
      {imageError || !imageUrl ? (
        <ListingAutoCover
          listingId={listing.id}
          title={listing.title}
          description={listing.description}
          category={listing.category}
          subcategory={listing.subcategory}
          size="sm"
          showTitle={false}
        />
      ) : (
        <CachedListingImage
          src={imageUrl}
          alt={listing.title}
          className={`absolute inset-0 h-full w-full object-cover ${dimmed ? 'grayscale opacity-60' : ''}`}
          onError={() => setImageError(true)}
        />
      )}

      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1.5 pt-6">
        <span className="block truncate text-[11px] font-bold leading-tight text-white">
          {priceLabel(listing, t)}
        </span>
      </span>

      {statusLabel ? (
        <span className="absolute left-1 top-1 max-w-[70%] truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {statusLabel}
        </span>
      ) : null}

      {onToggleFavorite ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"
          aria-label={t('navigation.favorites')}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      ) : null}

      {(onEdit || onMarkAsSold || onReactivate || onPromote || onDistribute) && (
        <div className="absolute right-1 top-1 flex flex-col gap-1">
          {!isSold && onEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isPending) {
                  tg?.HapticFeedback.notificationOccurred('error');
                  return;
                }
                onEdit();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={t('common.edit')}
            >
              <Edit2 size={13} />
            </button>
          ) : null}
          {!isSold && !isPending && !isRejected && onMarkAsSold ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsSold();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={t('editListing.markAsSold')}
            >
              <DollarSign size={13} />
            </button>
          ) : null}
          {!isSold && !isDeactivated && !isPending && !isRejected && onPromote ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPromote();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={t('businessProfile.owner.promoteListings')}
            >
              <Megaphone size={13} />
            </button>
          ) : null}
          {isDeactivated && !isSold && !isPending && !isRejected && onReactivate ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReactivate();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={t('sales.activate') || 'Активувати'}
            >
              <RotateCcw size={13} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );

  if (!showDistribute) {
    return square;
  }

  return (
    <div className="flex w-full flex-col gap-1">
      {square}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDistribute?.();
          tg?.HapticFeedback.impactOccurred('light');
        }}
        className={`flex w-full items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-bold leading-tight active:opacity-90 ${listingDistributeButtonClass(isLight)}`}
      >
        <Send size={11} className="shrink-0" />
        <span className="truncate">{t('sales.distribute')}</span>
      </button>
    </div>
  );
}
