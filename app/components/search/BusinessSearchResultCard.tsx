'use client';

import { useMemo, useState } from 'react';
import { MapPin, Star } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { ListingAutoCover } from '@/components/listing/ListingAutoCover';
import { getCurrencySymbol } from '@/utils/currency';

export type BusinessSearchCardData = {
  id: number;
  businessName: string;
  logo: string | null;
  sellerTelegramId: string;
  rating: number;
  reviewsCount: number;
  activityLine: string;
  locationLine: string;
  isFollowing?: boolean;
  followersCount?: number;
  vitrineListings?: Listing[];
};

type BusinessSearchResultCardProps = {
  business: BusinessSearchCardData;
  onOpen: (business: BusinessSearchCardData) => void;
  onSelectListing?: (listing: Listing) => void;
  onToggleFavorite?: (id: number) => void;
  favorites?: Set<number>;
  onToggleFollow?: (business: BusinessSearchCardData) => void;
  followBusy?: boolean;
  tg?: TelegramWebApp | null;
};

const VITRINE_SQ = 'relative aspect-square w-[4.25rem] shrink-0 overflow-hidden rounded-lg sm:w-[4.75rem]';

function formatRatingReviews(
  rating: number,
  count: number,
  t: (key: string, params?: Record<string, string>) => string
): string {
  const ratingStr = rating.toFixed(1);
  const mod10 = count % 10;
  const mod100 = count % 100;
  let key = 'businessProfile.public.ratingReviews';
  if (mod10 === 1 && mod100 !== 11) key = 'businessProfile.public.ratingReviews_one';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    key = 'businessProfile.public.ratingReviews_few';
  }
  return t(key, { rating: ratingStr, count: String(count) });
}

function vitrinePriceLabel(listing: Listing, t: (key: string) => string) {
  if (listing.isFree) return t('common.free');
  const negotiable =
    listing.price === t('common.negotiable') ||
    listing.price === 'Договірна' ||
    listing.price === 'Договорная';
  if (negotiable) return t('common.negotiableShort');
  return `${listing.price}${getCurrencySymbol(listing.currency)}`;
}

function VitrineSquare({
  item,
  onSelect,
  tg,
  t,
}: {
  item: Listing;
  onSelect?: (listing: Listing) => void;
  tg?: TelegramWebApp | null;
  t: (key: string) => string;
}) {
  const imageSrc = useMemo(() => resolveListingCardImageUrl(item), [item]);
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(imageSrc) && !imageFailed;

  return (
    <button
      type="button"
      onClick={() => {
        tg?.HapticFeedback?.impactOccurred?.('light');
        onSelect?.(item);
      }}
      className={VITRINE_SQ}
      aria-label={item.title}
    >
      {showPhoto ? (
        <CachedListingImage
          src={imageSrc!}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          fadeIn={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ListingAutoCover
          listingId={item.id}
          title={item.title}
          description={item.description}
          category={item.category}
          subcategory={item.subcategory}
          size="sm"
          showTitle={false}
        />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-4">
        <span className="block truncate text-center text-[9px] font-bold leading-tight text-white sm:text-[10px]">
          {vitrinePriceLabel(item, t)}
        </span>
      </span>
    </button>
  );
}

export function BusinessSearchResultCard({
  business,
  onOpen,
  onSelectListing,
  onToggleFollow,
  followBusy = false,
  tg,
}: BusinessSearchResultCardProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const logoUrl = business.logo ? getResolvedImageUrl(business.logo) : null;
  const showRating = business.reviewsCount > 0 && business.rating > 0;
  const listings = (business.vitrineListings ?? []).filter((l) => l.status === 'active' || !l.status);
  const hasListings = listings.length > 0 && Boolean(onSelectListing);

  const shellClass = isLight
    ? 'border-[#3F5331]/15 bg-white'
    : 'border-[#C8E6A0]/15 bg-[#141414]';

  const openProfile = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    onOpen(business);
  };

  return (
    <section className={`overflow-hidden rounded-2xl border ${shellClass}`}>
      <div className="p-4">
        <div className="mb-3 flex w-full items-start gap-3">
          <button
            type="button"
            onClick={openProfile}
            className={`h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-2xl border-2 ${
              isLight ? 'border-white bg-white shadow-md' : 'border-[#C8E6A0]/25 bg-[#1C1C1C]'
            }`}
            aria-label={business.businessName}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center text-2xl font-bold ${
                  isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-white/10 text-[#C8E6A0]'
                }`}
              >
                {business.businessName.charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mb-1.5 flex flex-wrap items-start gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={openProfile}
                className={`min-w-0 flex-1 text-left ${ac.pageHeading}`}
              >
                <span
                  className="text-base font-bold leading-snug"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {business.businessName}
                </span>
              </button>
              {onToggleFollow ? (
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => {
                    tg?.HapticFeedback?.impactOccurred?.('light');
                    onToggleFollow(business);
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    business.isFollowing
                      ? isLight
                        ? 'border border-[#3F5331]/25 bg-[#E8F0E0]/80 text-[#3F5331]'
                        : 'border border-[#C8E6A0]/35 bg-[#C8E6A0]/10 text-[#C8E6A0]'
                      : isLight
                        ? 'bg-[#C8E6A0] text-[#1a1a1a] hover:opacity-90'
                        : 'bg-[#C8E6A0] text-[#1a1a1a] hover:opacity-90'
                  }`}
                >
                  {business.isFollowing
                    ? t('businessProfile.public.subscribed')
                    : t('businessProfile.public.subscribe')}
                </button>
              ) : null}
            </div>

            <button type="button" onClick={openProfile} className="w-full text-left">
              {showRating && (
                <div className={`mb-1.5 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                  <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />
                  <span>{formatRatingReviews(business.rating, business.reviewsCount, t)}</span>
                </div>
              )}

              {business.activityLine ? (
                <p className={`mb-1 line-clamp-2 text-sm leading-snug ${ac.mutedText}`}>
                  {business.activityLine}
                </p>
              ) : null}

              {business.locationLine ? (
                <div className={`flex items-center gap-1 text-sm ${ac.mutedText}`}>
                  <MapPin size={14} className="shrink-0" />
                  <span className="line-clamp-1">{business.locationLine}</span>
                </div>
              ) : null}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={openProfile}
          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
            isLight
              ? 'border-[#3F5331] text-[#3F5331] hover:bg-[#E8F0E0]/70'
              : 'border-[#C8E6A0]/60 text-[#C8E6A0] hover:bg-[#C8E6A0]/10'
          }`}
        >
          {t('businessProfile.public.viewProfile')}
        </button>

        {hasListings ? (
          <div
            className="scrollbar-hide mt-3 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex gap-1.5">
              {listings.slice(0, 12).map((listing) => (
                <VitrineSquare
                  key={listing.id}
                  item={listing}
                  onSelect={onSelectListing}
                  tg={tg}
                  t={t}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
