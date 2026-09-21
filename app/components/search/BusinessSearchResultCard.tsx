'use client';

import { ChevronRight, Heart, MapPin, Star } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';

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
};

type BusinessSearchResultCardProps = {
  business: BusinessSearchCardData;
  onOpen: (business: BusinessSearchCardData) => void;
  onToggleFollow?: (business: BusinessSearchCardData) => void;
  followBusy?: boolean;
  tg?: TelegramWebApp | null;
};

export function BusinessSearchResultCard({
  business,
  onOpen,
  onToggleFollow,
  followBusy = false,
  tg,
}: BusinessSearchResultCardProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const logoUrl = business.logo ? getResolvedImageUrl(business.logo) : null;
  const showRating = business.reviewsCount > 0 && business.rating > 0;

  return (
    <button
      type="button"
      onClick={() => {
        tg?.HapticFeedback?.impactOccurred?.('light');
        onOpen(business);
      }}
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        isLight
          ? 'border-[#3F5331]/12 bg-white hover:bg-[#F7FAF3]'
          : 'border-white/10 bg-[#111] hover:bg-white/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#111]">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-[#C8E6A0]">
              {business.businessName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className={`min-w-0 flex-1 truncate text-base font-semibold ${ac.pageHeading}`}>
              {business.businessName}
            </h3>
            {onToggleFollow && (
              <button
                type="button"
                disabled={followBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  tg?.HapticFeedback?.impactOccurred?.('light');
                  onToggleFollow(business);
                }}
                className={`shrink-0 rounded-full p-1 ${
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
          </div>

          <span
            className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide ${
              isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
            }`}
          >
            BUSINESS
          </span>

          {showRating && (
            <p className={`mt-2 flex items-center gap-1 text-sm ${ac.mutedText}`}>
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span>
                {business.rating.toFixed(1)} · {t('bazaar.search.businessReviews', { count: String(business.reviewsCount) })}
              </span>
            </p>
          )}

          {business.activityLine && (
            <p className={`mt-1 text-sm ${ac.mutedText}`}>{business.activityLine}</p>
          )}

          {business.locationLine && (
            <p className={`mt-1 flex items-center gap-1 text-sm ${ac.mutedText}`}>
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{business.locationLine}</span>
            </p>
          )}

          <p
            className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${
              isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'
            }`}
          >
            {t('bazaar.search.viewBusinessProfile')}
            <ChevronRight size={16} />
          </p>
        </div>
      </div>
    </button>
  );
}
