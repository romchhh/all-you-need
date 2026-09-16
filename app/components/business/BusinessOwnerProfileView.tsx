'use client';

import type { ReactNode } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Clover,
  Heart,
  MessageCircle,
  Rocket,
  Settings2,
  Star,
  Users,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { getAvatarColor } from '@/utils/avatarColors';
import {
  BUSINESS_PLAN_MONTHLY_CREDITS,
  type BusinessPlanId,
} from '@/lib/businessProfileConstants';
import type { BusinessProfileStatsPayload } from '@/lib/businessProfileHelpers';
import type { ProfileViewMode } from '@/components/business/ProfileModeSwitcher';

export type BusinessListingTab = 'active' | 'moderation' | 'inactive';

export type BusinessProfileData = {
  businessName: string;
  logo?: string | null;
  coverImage?: string | null;
  description?: string;
  city?: string;
  plan?: string | null;
  linkedListingIds?: string | null;
  category?: string;
  subcategory?: string | null;
  address?: string | null;
  serviceArea?: string;
  serviceRadiusKm?: number | null;
  telegram?: string | null;
  phone?: string | null;
  instagram?: string | null;
  website?: string | null;
  workingHours?: string | null;
  updatedAt?: string;
  subscriptionEndsAt?: string | null;
  highlightCreditsRemaining?: number;
  topCreditsRemaining?: number;
};

interface BusinessOwnerProfileViewProps {
  personalName: string;
  personalAvatar?: string | null;
  businessProfile: BusinessProfileData;
  businessStats: BusinessProfileStatsPayload;
  rating: number;
  reviewsCount: number;
  profileViewMode: ProfileViewMode;
  onProfileModeChange: (mode: ProfileViewMode) => void;
  listingTab: BusinessListingTab;
  onListingTabChange: (tab: BusinessListingTab) => void;
  onPreviewProfile: () => void;
  onEditBusiness: () => void;
  onManageSubscription: () => void;
  onPromoteListings: () => void;
  onCreateListing?: () => void;
  renderListings: () => ReactNode;
  hasMoreListings?: boolean;
  onLoadMore?: () => void;
}

function formatRatingLine(
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

function formatSubscriptionDate(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function BusinessOwnerProfileView({
  personalName,
  personalAvatar,
  businessProfile,
  businessStats,
  rating,
  reviewsCount,
  profileViewMode,
  onProfileModeChange,
  listingTab,
  onListingTabChange,
  onPreviewProfile,
  onEditBusiness,
  onManageSubscription,
  onPromoteListings,
  onCreateListing,
  renderListings,
  hasMoreListings,
  onLoadMore,
}: BusinessOwnerProfileViewProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const logoUrl = businessProfile.logo ? getResolvedImageUrl(businessProfile.logo) : null;
  const personalAvatarUrl = personalAvatar ? getResolvedImageUrl(personalAvatar) : null;
  const isPro = businessProfile.plan === 'business_pro';
  const planId = (businessProfile.plan === 'business_pro' ? 'business_pro' : 'business') as BusinessPlanId;
  const planCredits = BUSINESS_PLAN_MONTHLY_CREDITS[planId];
  const highlightRemaining = businessProfile.highlightCreditsRemaining ?? 0;
  const topRemaining = businessProfile.topCreditsRemaining ?? 0;
  const promoDiscount = isPro ? 20 : 10;
  const showRating = reviewsCount > 0 && rating > 0;

  const cardShell = isLight
    ? 'rounded-2xl border border-[#3F5331]/12 bg-white'
    : 'rounded-2xl border border-[#C8E6A0]/15 bg-[#141414]';
  const limeBorder = isLight ? 'border-[#3F5331]/35' : 'border-[#C8E6A0]/35';
  const limeText = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';
  const limeBg = isLight ? 'bg-[#C8E6A0]' : 'bg-[#C8E6A0]';
  const limeBgSoft = isLight ? 'bg-[#C8E6A0]/20' : 'bg-[#C8E6A0]/10';

  const kpiItems = [
    { key: 'kpiViews', value: businessStats.listingViews + businessStats.profileViews },
    { key: 'kpiInquiries', value: businessStats.contactClicks },
    { key: 'kpiFavorites', value: businessStats.favoritesTotal },
    { key: 'kpiReviews', value: 0 },
  ] as const;

  const listingTabs: Array<{ id: BusinessListingTab; label: string; count: number }> = [
    { id: 'active', label: t('businessProfile.owner.tabActive'), count: businessStats.activeListings },
    { id: 'moderation', label: t('businessProfile.owner.tabModeration'), count: businessStats.pendingListings },
    { id: 'inactive', label: t('businessProfile.owner.tabInactive'), count: businessStats.inactiveListings },
  ];

  return (
    <div className="px-4 pb-4 space-y-4">
      {/* Profile switcher */}
      <div
        className={`flex items-center gap-2 rounded-2xl p-1.5 ${
          isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'
        }`}
      >
        <button
          type="button"
          onClick={() => onProfileModeChange('personal')}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
            profileViewMode === 'personal'
              ? `${limeBg} text-[#1a1a1a] shadow-sm`
              : isLight
                ? 'text-gray-700 hover:bg-white/70'
                : 'text-white/75 hover:bg-white/10'
          }`}
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-200">
            {personalAvatarUrl ? (
              <img src={personalAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center text-xs font-bold text-white ${getAvatarColor(personalName)}`}
              >
                {personalName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <span className="truncate text-xs font-semibold">
            {personalName}
            <span className={`block text-[10px] font-medium ${profileViewMode === 'personal' ? 'text-[#1a1a1a]/70' : ac.mutedText}`}>
              {t('businessProfile.switcher.personal')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onProfileModeChange('business')}
          className={`flex min-w-0 flex-[1.15] items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
            profileViewMode === 'business'
              ? `${limeBg} text-[#1a1a1a] shadow-sm`
              : isLight
                ? 'text-gray-700 hover:bg-white/70'
                : 'text-white/75 hover:bg-white/10'
          }`}
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-[#111]">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#C8E6A0]">
                {businessProfile.businessName.charAt(0)}
              </div>
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{businessProfile.businessName}</span>
          <ChevronDown size={16} className="shrink-0 opacity-70" />
        </button>
      </div>

      {/* Identity */}
      <div className={`${cardShell} p-4`}>
        <div className="mb-4 flex items-start gap-4">
          <div
            className={`h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 ${
              isLight ? 'border-white bg-[#111] shadow-md' : 'border-[#C8E6A0]/20 bg-[#111]'
            }`}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#3F5331]/30 text-3xl font-bold text-[#C8E6A0]">
                {businessProfile.businessName.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="mb-1 flex items-center gap-1.5">
              <h2 className={`truncate text-xl font-bold ${ac.pageHeading}`}>{businessProfile.businessName}</h2>
              <BadgeCheck size={18} className="shrink-0 text-emerald-400" />
            </div>
            <span className={`mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${limeBg} text-[#1a1a1a]`}>
              BUSINESS{isPro ? ' PRO' : ''}
            </span>
            {showRating && (
              <div className={`mb-1 flex items-center gap-1 text-sm ${ac.mutedText}`}>
                <Star size={14} className="fill-amber-400 text-amber-400" />
                <span>{formatRatingLine(rating, reviewsCount, t)}</span>
              </div>
            )}
            <div className={`flex items-center gap-1 text-sm ${ac.mutedText}`}>
              <Users size={14} />
              <span>
                {businessStats.followersCount} {t('businessProfile.public.followersLabel')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPreviewProfile}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${limeBorder} ${limeText} ${
              isLight ? 'hover:bg-[#E8F0E0]/70' : 'hover:bg-[#C8E6A0]/10'
            }`}
          >
            <MessageCircle size={18} />
            {t('businessProfile.owner.viewProfile')}
          </button>
          <button
            type="button"
            onClick={onEditBusiness}
            aria-label={t('businessProfile.editTitle')}
            className={`flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl border transition-colors ${limeBorder} ${limeText} ${
              isLight ? 'hover:bg-[#E8F0E0]/70' : 'hover:bg-[#C8E6A0]/10'
            }`}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </div>

      {/* Subscription */}
      {businessProfile.subscriptionEndsAt && (
        <div className={`${cardShell} border-2 ${limeBorder} p-4`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className={`text-sm font-medium leading-snug ${ac.pageHeading}`}>
              {t('businessProfile.owner.subscriptionActiveUntil', {
                date: formatSubscriptionDate(businessProfile.subscriptionEndsAt, language),
              })}
            </p>
            <button
              type="button"
              onClick={onManageSubscription}
              className={`shrink-0 text-sm font-semibold ${limeText}`}
            >
              {t('businessProfile.owner.manage')} →
            </button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className={`rounded-xl px-3 py-2.5 ${isLight ? 'bg-gray-50' : 'bg-white/[0.05]'}`}>
              <div className={`mb-1 flex items-center gap-1 text-xs ${ac.mutedText}`}>
                <Heart size={14} />
                {t('businessProfile.owner.highlightSlots')}
              </div>
              <p className={`text-lg font-bold tabular-nums ${ac.pageHeading}`}>
                {highlightRemaining} / {planCredits.highlight}
              </p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 ${isLight ? 'bg-gray-50' : 'bg-white/[0.05]'}`}>
              <div className={`mb-1 flex items-center gap-1 text-xs ${ac.mutedText}`}>
                <Rocket size={14} />
                {t('businessProfile.owner.topSlots')}
              </div>
              <p className={`text-lg font-bold tabular-nums ${ac.pageHeading}`}>
                {topRemaining} / {planCredits.top}
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${limeBgSoft} ${limeText}`}>
            <Clover size={14} className="shrink-0" />
            <span>{t('businessProfile.owner.promoDiscount', { percent: String(promoDiscount) })}</span>
          </div>
        </div>
      )}

      {/* 30-day stats */}
      <div className={cardShell}>
        <div className={`flex items-center justify-between border-b px-4 py-3 ${isLight ? 'border-[#3F5331]/10' : 'border-white/10'}`}>
          <h3 className={`text-sm font-semibold ${ac.pageHeading}`}>{t('businessProfile.owner.results30days')}</h3>
          <span className={`text-xs font-medium ${limeText}`}>{t('businessProfile.owner.seeAll')} ›</span>
        </div>
        <div className="grid grid-cols-4 divide-x">
          {kpiItems.map(({ key, value }) => (
            <div
              key={key}
              className={`px-1 py-4 text-center ${isLight ? 'divide-[#3F5331]/10' : 'divide-white/10'}`}
            >
              <div className={`text-lg font-bold tabular-nums leading-none ${ac.pageHeading}`}>
                {value.toLocaleString(language === 'ru' ? 'ru-RU' : 'uk-UA')}
              </div>
              <div className={`mt-2 text-[10px] leading-tight ${ac.mutedText}`}>
                {t(`businessProfile.owner.${key}`)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div className={cardShell}>
        <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${isLight ? 'border-[#3F5331]/10' : 'border-white/10'}`}>
          <h3 className={`text-sm font-semibold ${ac.pageHeading}`}>{t('businessProfile.owner.myListings')}</h3>
          {onCreateListing && (
            <button
              type="button"
              onClick={onCreateListing}
              className={`text-sm font-semibold ${limeText}`}
            >
              + {t('businessProfile.owner.addListing')}
            </button>
          )}
        </div>

        <div className={`flex gap-1 border-b p-2 ${isLight ? 'border-[#3F5331]/10' : 'border-white/10'}`}>
          {listingTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onListingTabChange(tab.id)}
              className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
                listingTab === tab.id
                  ? `${limeBg} text-[#1a1a1a]`
                  : isLight
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'text-white/65 hover:bg-white/10'
              }`}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={onPromoteListings}
            className={`mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${limeBorder} ${limeText} ${
              isLight ? 'hover:bg-[#E8F0E0]/70' : 'hover:bg-[#C8E6A0]/10'
            }`}
          >
            <Rocket size={18} />
            {t('businessProfile.owner.promoteListings')}
          </button>

          <div className="space-y-3">{renderListings()}</div>

          {hasMoreListings && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className={`mt-3 flex w-full items-center justify-center gap-1 py-2 text-sm font-semibold ${limeText}`}
            >
              {t('businessProfile.owner.allListings')} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
