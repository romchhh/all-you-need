'use client';

import { ChevronRight, Globe, MapPin, Package, Star, Users } from 'lucide-react';
import { BusinessSeller } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';

interface BusinessSellerBlockProps {
  business: BusinessSeller;
  onViewProfile?: () => void;
  tg?: TelegramWebApp | null;
}

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

export function BusinessSellerBlock({ business, onViewProfile, tg }: BusinessSellerBlockProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const logoUrl = business.logo ? getResolvedImageUrl(business.logo) : null;
  const isPro = business.plan === 'business_pro';
  const showRating = (business.reviewsCount ?? 0) > 0 && (business.rating ?? 0) > 0;
  const telegramSinceLabel = business.telegramSince
    ? t('businessProfile.public.onTelegramSince', { date: business.telegramSince })
    : business.memberSince;

  const shellClass = isLight
    ? 'border-[#3F5331]/15 bg-white'
    : 'border-[#C8E6A0]/15 bg-[#141414]';

  return (
    <div className={`mb-6 overflow-hidden rounded-2xl border ${shellClass}`}>
      <div className="p-4">
        <h2 className={`mb-4 text-base font-semibold ${ac.pageHeading}`}>{t('listing.seller')}</h2>

        <button
          type="button"
          onClick={() => {
            onViewProfile?.();
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className={`mb-4 flex w-full items-start gap-3 rounded-xl text-left transition-colors ${
            isLight ? 'hover:bg-gray-50' : 'hover:bg-white/[0.04]'
          }`}
        >
          <div
            className={`h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-2xl border-2 ${
              isLight ? 'border-white bg-white shadow-md' : 'border-[#C8E6A0]/25 bg-[#1C1C1C]'
            }`}
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
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <p className={`mb-1.5 truncate text-base font-bold ${ac.pageHeading}`}>{business.businessName}</p>
            <span
              className={`mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                isLight ? 'bg-[#C8E6A0] text-[#1a2414]' : 'bg-[#C8E6A0] text-[#0f1408]'
              }`}
            >
              BUSINESS{isPro ? ' PRO' : ''}
            </span>
            {showRating && (
              <div className={`mb-1.5 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />
                <span>{formatRatingReviews(business.rating!, business.reviewsCount!, t)}</span>
              </div>
            )}
            <div className={`flex items-center gap-1 text-sm ${ac.mutedText}`}>
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{business.city}</span>
            </div>
          </div>

          <ChevronRight size={20} className={`mt-2 shrink-0 ${ac.mutedText}`} />
        </button>

        {onViewProfile && (
          <button
            type="button"
            onClick={() => {
              onViewProfile();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`mb-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
              isLight
                ? 'border-[#3F5331] text-[#3F5331] hover:bg-[#E8F0E0]/70'
                : 'border-[#C8E6A0]/60 text-[#C8E6A0] hover:bg-[#C8E6A0]/10'
            }`}
          >
            {t('businessProfile.public.viewProfile')}
          </button>
        )}

        <div
          className={`grid grid-cols-3 divide-x text-center text-xs ${
            isLight ? 'divide-[#3F5331]/10 text-gray-600' : 'divide-white/10 text-white/60'
          }`}
        >
          <div className="flex flex-col items-center gap-1 px-1 py-1">
            <Users size={16} className="opacity-70" />
            <span className={`text-base font-bold tabular-nums ${ac.pageHeading}`}>{business.followersCount}</span>
            <span className="leading-tight">{t('businessProfile.public.followersShort')}</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-1 py-1">
            <Package size={16} className="opacity-70" />
            <span className={`text-base font-bold tabular-nums ${ac.pageHeading}`}>{business.activeListingsCount}</span>
            <span className="leading-tight">{t('businessProfile.public.listingsShort')}</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-1 py-1">
            <Globe size={16} className="opacity-70" />
            <span className={`text-sm font-semibold leading-tight ${ac.pageHeading}`}>{telegramSinceLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
