'use client';

import { useState } from 'react';
import { MapPin, Star } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { shortenCoverTitle } from '@/lib/listings/autoCover';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { ListingAutoCover } from '@/components/listing/ListingAutoCover';

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

const THUMB =
  'relative h-[7.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-md sm:h-[8.25rem] sm:w-[6rem]';

function VitrineThumb({
  item,
  onSelect,
  tg,
}: {
  item: Listing;
  onSelect?: (listing: Listing) => void;
  tg?: TelegramWebApp | null;
}) {
  const imageSrc = resolveListingCardImageUrl(item);
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(imageSrc) && !imageFailed;
  const caption = shortenCoverTitle(item.title, item.description, 34);

  return (
    <button
      type="button"
      onClick={() => {
        tg?.HapticFeedback?.impactOccurred?.('light');
        onSelect?.(item);
      }}
      className={`${THUMB} text-left`}
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
          className="!pb-9"
        />
      )}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[2] px-1.5 pb-1.5 pt-7 ${
          showPhoto
            ? 'bg-gradient-to-t from-black/80 via-black/45 to-transparent'
            : 'bg-gradient-to-t from-black/55 via-black/25 to-transparent'
        }`}
      >
        <p className="line-clamp-2 text-[9px] font-medium leading-[1.15] text-white sm:text-[10px]">
          {caption}
        </p>
      </div>
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

  const openProfile = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    onOpen(business);
  };

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        isLight ? 'border-[#3F5331]/12 bg-white' : 'border-white/10 bg-[#111]'
      }`}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <button type="button" onClick={openProfile} className="shrink-0" aria-label={business.businessName}>
          <div className="h-11 w-11 overflow-hidden rounded-full bg-[#111] ring-2 ring-[#3F5331]/20 ring-offset-1 ring-offset-transparent sm:h-12 sm:w-12">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-[#C8E6A0]">
                {business.businessName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </button>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={openProfile} className="w-full text-left">
            <div className="flex items-start gap-2">
              <h3
                className={`min-w-0 flex-1 text-base font-semibold leading-snug sm:text-[1.0625rem] ${ac.pageHeading}`}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {business.businessName}
              </h3>
              <span
                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${
                  isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
                }`}
              >
                BUSINESS
              </span>
            </div>

            {showRating && (
              <p className={`mt-1 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                <Star size={14} className="fill-amber-400 text-amber-400" />
                <span>
                  {business.rating.toFixed(1)} ·{' '}
                  {t('bazaar.search.businessReviews', { count: String(business.reviewsCount) })}
                </span>
              </p>
            )}

            {business.activityLine ? (
              <p className={`mt-0.5 line-clamp-1 text-sm ${ac.mutedText}`}>{business.activityLine}</p>
            ) : null}

            {business.locationLine ? (
              <p className={`mt-0.5 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">{business.locationLine}</span>
              </p>
            ) : null}
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onToggleFollow ? (
              <button
                type="button"
                disabled={followBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  tg?.HapticFeedback?.impactOccurred?.('light');
                  onToggleFollow(business);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
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

            <button
              type="button"
              onClick={openProfile}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isLight
                  ? 'border-[#3F5331]/25 text-[#3F5331] hover:bg-[#E8F0E0]/70'
                  : 'border-[#C8E6A0]/35 text-[#C8E6A0] hover:bg-[#C8E6A0]/10'
              }`}
            >
              {t('bazaar.search.viewBusinessProfile')}
            </button>
          </div>
        </div>
      </div>

      {hasListings ? (
        <div
          className="scrollbar-hide overflow-x-auto px-3 pb-3 pt-0 sm:px-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex gap-2.5">
            {listings.slice(0, 8).map((listing) => (
              <VitrineThumb
                key={listing.id}
                item={listing}
                onSelect={onSelectListing}
                tg={tg}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
