'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, MapPin, Star } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { ListingAutoCover } from '@/components/listing/ListingAutoCover';
import { CategoryIcon } from '@/components/listing/CategoryIcon';
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

/** Скільки превʼю в рядку перед плашкою «N оголошень у профілі». */
const VITRINE_PREVIEW_MAX = 3;
const VITRINE_THUMB =
  'relative aspect-[4/5] w-[4.75rem] shrink-0 overflow-hidden rounded-xl sm:w-[5.25rem]';

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

function formatListingsInProfileCount(
  count: number,
  t: (key: string, params?: Record<string, string>) => string
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let key = 'businessProfile.public.listingsCount_many';
  if (mod10 === 1 && mod100 !== 11) key = 'businessProfile.public.listingsCount_one';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    key = 'businessProfile.public.listingsCount_few';
  }
  return t(key, { count: String(count) });
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

function ListingThumb({
  item,
  className,
}: {
  item: Listing;
  className: string;
}) {
  const imageSrc = useMemo(() => resolveListingCardImageUrl(item), [item]);
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(imageSrc) && !imageFailed;

  return (
    <div className={`relative overflow-hidden ${className}`}>
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
    </div>
  );
}

function VitrineSquare({
  item,
  onSelect,
  tg,
  t,
  className,
}: {
  item: Listing;
  onSelect?: (listing: Listing) => void;
  tg?: TelegramWebApp | null;
  t: (key: string) => string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        tg?.HapticFeedback?.impactOccurred?.('light');
        onSelect?.(item);
      }}
      className={className ?? VITRINE_THUMB}
      aria-label={item.title}
    >
      <ListingThumb item={item} className="absolute inset-0 h-full w-full" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-1.5 pt-5">
        <span className="block truncate text-center text-[10px] font-bold leading-tight text-white">
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
  const listingCount = listings.length;
  const canOpenListings = listingCount > 0 && Boolean(onSelectListing);
  const previewListings = listings.slice(0, VITRINE_PREVIEW_MAX);
  const plaqueCategory = previewListings[0]?.category || 'all_categories';

  const shellClass = isLight
    ? 'border-[#3F5331]/15 bg-white'
    : 'border-[#C8E6A0]/20 bg-[#141414]';

  const openProfile = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');
    onOpen(business);
  };

  const subscribeBtnClass = business.isFollowing
    ? isLight
      ? 'shrink-0 rounded-full border border-[#3F5331]/35 bg-[#E8F0E0] px-3 py-1 text-[10px] font-semibold text-[#3F5331] disabled:opacity-60'
      : 'shrink-0 rounded-full border border-[#C8E6A0]/40 bg-[#C8E6A0]/15 px-3 py-1 text-[10px] font-semibold text-[#C8E6A0] disabled:opacity-60'
    : 'shrink-0 rounded-full bg-[#C8E6A0] px-3 py-1 text-[10px] font-semibold text-[#0f1408] shadow-sm hover:bg-[#dff5c0] active:opacity-90 disabled:opacity-60';

  return (
    <section className={`overflow-hidden rounded-2xl border ${shellClass}`}>
      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={openProfile}
            className={`h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl border-2 ${
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

          <div className="min-w-0 flex-1">
            <button type="button" onClick={openProfile} className={`w-full text-left ${ac.pageHeading}`}>
              <span
                className="text-[17px] font-bold leading-snug"
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

            {(showRating || onToggleFollow) && (
              <div className="mt-1.5 flex min-w-0 items-center gap-2">
                {showRating ? (
                  <div className={`flex min-w-0 flex-1 items-center gap-1 text-sm ${ac.mutedText}`}>
                    <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />
                    <span className="min-w-0 truncate">
                      {formatRatingReviews(business.rating, business.reviewsCount, t)}
                    </span>
                  </div>
                ) : (
                  <span className="min-w-0 flex-1" aria-hidden />
                )}
                {onToggleFollow ? (
                  <button
                    type="button"
                    disabled={followBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      tg?.HapticFeedback?.impactOccurred?.('light');
                      onToggleFollow(business);
                    }}
                    className={subscribeBtnClass}
                  >
                    {business.isFollowing
                      ? t('businessProfile.public.subscribed')
                      : t('businessProfile.public.subscribe')}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {business.activityLine || business.locationLine ? (
          <button type="button" onClick={openProfile} className="w-full space-y-1 text-left">
            {business.activityLine ? (
              <p className={`line-clamp-2 text-sm leading-snug ${ac.mutedText}`}>{business.activityLine}</p>
            ) : null}
            {business.locationLine ? (
              <div className={`flex items-start gap-1.5 text-sm ${ac.mutedText}`}>
                <MapPin size={15} className="mt-0.5 shrink-0 opacity-80" />
                <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{business.locationLine}</span>
              </div>
            ) : null}
          </button>
        ) : null}

        {canOpenListings ? (
          <div className="flex min-w-0 items-stretch gap-0">
            <div className="scrollbar-hide flex min-w-0 shrink items-stretch gap-2 overflow-x-auto pr-2.5">
              {previewListings.map((listing) => (
                <VitrineSquare
                  key={listing.id}
                  item={listing}
                  onSelect={onSelectListing}
                  tg={tg}
                  t={t}
                  className={VITRINE_THUMB}
                />
              ))}
            </div>

            <div
              className={`mx-0.5 w-px shrink-0 self-stretch ${
                isLight ? 'bg-[#3F5331]/20' : 'bg-white/15'
              }`}
              aria-hidden
            />

            <button
              type="button"
              onClick={openProfile}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-1 pl-2.5 pr-0.5 text-left transition-opacity active:opacity-80"
              aria-label={t('businessProfile.public.singleListingInProfile')}
            >
              <CategoryIcon
                categoryId={plaqueCategory}
                size={26}
                className="shrink-0 opacity-90"
              />
              <span className="min-w-0 flex-1 leading-[1.15]">
                <span className={`block text-[13px] font-semibold ${ac.pageHeading}`}>
                  {formatListingsInProfileCount(listingCount, t)}
                </span>
                <span className={`block text-[12px] ${ac.mutedText}`}>
                  {t('businessProfile.public.inProfile')}
                </span>
              </span>
              <ChevronRight
                size={18}
                className={`shrink-0 ${isLight ? 'text-[#3F5331]/65' : 'text-white/65'}`}
                aria-hidden
              />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={openProfile}
          className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
            isLight
              ? 'border-[#3F5331] text-[#3F5331] hover:bg-[#E8F0E0]/70'
              : 'border-[#C8E6A0]/55 text-[#C8E6A0] hover:bg-[#C8E6A0]/10'
          }`}
        >
          {t('businessProfile.public.viewProfile')}
          <ChevronRight size={18} className="opacity-90" aria-hidden />
        </button>
      </div>
    </section>
  );
}
