'use client';

import { ChevronRight, Heart, MapPin, Star } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { ListingCard } from '@/components/listing/ListingCard';

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

export function BusinessSearchResultCard({
  business,
  onOpen,
  onSelectListing,
  onToggleFavorite,
  favorites,
  onToggleFollow,
  followBusy = false,
  tg,
}: BusinessSearchResultCardProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const logoUrl = business.logo ? getResolvedImageUrl(business.logo) : null;
  const showRating = business.reviewsCount > 0 && business.rating > 0;
  const listings = business.vitrineListings ?? [];
  const favSet = favorites ?? new Set<number>();

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        isLight ? 'border-[#3F5331]/12 bg-white' : 'border-white/10 bg-[#111]'
      }`}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => {
            tg?.HapticFeedback?.impactOccurred?.('light');
            onOpen(business);
          }}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#111] ring-2 ring-offset-1 ring-offset-transparent ring-[#3F5331]/20 sm:h-12 sm:w-12">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-[#C8E6A0]">
                {business.businessName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h3 className={`truncate text-base font-semibold sm:text-[1.0625rem] ${ac.pageHeading}`}>
                {business.businessName}
              </h3>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${
                  isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
                }`}
              >
                BUSINESS
              </span>
            </div>

            {showRating && (
              <p className={`mt-0.5 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                <Star size={14} className="fill-amber-400 text-amber-400" />
                <span>
                  {business.rating.toFixed(1)} ·{' '}
                  {t('bazaar.search.businessReviews', { count: String(business.reviewsCount) })}
                </span>
              </p>
            )}

            {business.activityLine && (
              <p className={`mt-0.5 line-clamp-1 text-sm ${ac.mutedText}`}>{business.activityLine}</p>
            )}

            {business.locationLine && (
              <p className={`mt-0.5 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">{business.locationLine}</span>
              </p>
            )}
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {onToggleFollow && (
            <button
              type="button"
              disabled={followBusy}
              onClick={(e) => {
                e.stopPropagation();
                tg?.HapticFeedback?.impactOccurred?.('light');
                onToggleFollow(business);
              }}
              className={`rounded-full p-1 ${
                business.isFollowing
                  ? isLight
                    ? 'text-[#3F5331]'
                    : 'text-[#C8E6A0]'
                  : ac.mutedText
              }`}
              aria-label={t('businessProfile.public.follow')}
            >
              <Heart size={18} className={business.isFollowing ? 'fill-current' : ''} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              tg?.HapticFeedback?.impactOccurred?.('light');
              onOpen(business);
            }}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isLight
                ? 'border-[#3F5331]/25 bg-[#E8F0E0]/80 text-[#3F5331] hover:bg-[#E8F0E0]'
                : 'border-[#C8E6A0]/35 text-[#C8E6A0] hover:bg-[#C8E6A0]/10'
            }`}
          >
            {t('bazaar.search.viewBusinessProfile')}
          </button>
        </div>
      </div>

      {listings.length > 0 && onSelectListing && onToggleFavorite ? (
        <div
          className="scrollbar-hide w-full overflow-x-auto pb-3 pt-0"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex gap-2.5 pl-3 pr-3 sm:pl-4 sm:pr-4" style={{ minWidth: 'max-content' }}>
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="w-[40vw] max-w-[168px] flex-shrink-0 sm:w-[152px] sm:max-w-[152px]"
                style={{ overflow: 'visible' }}
              >
                <ListingCard
                  listing={listing}
                  layout="stacked"
                  isFavorite={favSet.has(listing.id)}
                  onSelect={onSelectListing}
                  onToggleFavorite={onToggleFavorite}
                  tg={tg ?? null}
                  showBusinessBadge={false}
                />
              </div>
            ))}
            <div className="w-1 min-w-[0.25rem] flex-shrink-0" aria-hidden />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(business)}
          className={`mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-medium sm:mx-4 sm:mb-4 sm:w-[calc(100%-2rem)] ${
            isLight ? 'bg-[#F5F7F2] text-[#3F5331]' : 'bg-white/5 text-white/80'
          }`}
        >
          {t('bazaar.search.viewBusinessProfile')}
          <ChevronRight size={16} />
        </button>
      )}
    </section>
  );
}
