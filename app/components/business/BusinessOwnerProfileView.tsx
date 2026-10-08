'use client';

import type { ReactNode } from 'react';
import {
  ChevronRight,
  Eye,
  Heart,
  MessageCircle,
  Rocket,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import {
  BUSINESS_PLAN_MONTHLY_CREDITS,
  type BusinessPlanId,
} from '@/lib/businessProfileConstants';
import type { BusinessProfileStatsPayload } from '@/lib/businessProfileConstants';
import type { ProfileViewMode } from '@/components/business/ProfileModeSwitcher';
import { ProfileModeSwitcherRich } from '@/components/business/ProfileModeSwitcherRich';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';

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
  portfolioImages?: string | null;
  updatedAt?: string;
  subscriptionEndsAt?: string | null;
  subscriptionStatus?: string;
  subscriptionAutoRenew?: boolean;
  hasProPaymentHistory?: boolean;
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
  onViewAllStats?: () => void;
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
  onViewAllStats,
  onPromoteListings,
  onCreateListing,
  renderListings,
  hasMoreListings,
  onLoadMore,
}: BusinessOwnerProfileViewProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);

  const logoUrl = businessProfile.logo ? getResolvedImageUrl(businessProfile.logo) : null;
  const isPro = businessProfile.plan === 'business_pro';
  const planId = (isPro ? 'business_pro' : 'business') as BusinessPlanId;
  const planCredits = BUSINESS_PLAN_MONTHLY_CREDITS[planId];
  const highlightRemaining = businessProfile.highlightCreditsRemaining ?? 0;
  const topRemaining = businessProfile.topCreditsRemaining ?? 0;
  const promoDiscount = isPro ? 20 : 10;
  const showRating = reviewsCount > 0 && rating > 0;
  const planBadgeLabel = isPro
    ? t('businessProfile.plans.businessPro.name')
    : t('businessProfile.plans.business.name');
  const renewalDate = businessProfile.subscriptionEndsAt
    ? formatSubscriptionDate(businessProfile.subscriptionEndsAt, language)
    : null;

  const kpiItems = [
    {
      key: 'kpiViews',
      value: businessStats.profileViews + businessStats.listingViews,
      icon: Eye,
    },
    { key: 'kpiInquiries', value: businessStats.contactClicks, icon: MessageCircle },
    { key: 'kpiFavorites', value: businessStats.favoritesTotal, icon: Heart },
    { key: 'kpiReviews', value: reviewsCount, icon: Star },
  ] as const;

  const listingTabs: Array<{ id: BusinessListingTab; label: string; count: number }> = [
    { id: 'active', label: t('businessProfile.owner.tabActive'), count: businessStats.activeListings },
    { id: 'moderation', label: t('businessProfile.owner.tabModeration'), count: businessStats.pendingListings },
    { id: 'inactive', label: t('businessProfile.owner.tabInactive'), count: businessStats.inactiveListings },
  ];

  return (
    <div className="space-y-4 px-4 pb-4">
      <ProfileModeSwitcherRich
        mode={profileViewMode}
        onChange={onProfileModeChange}
        personalName={personalName}
        personalAvatar={personalAvatar}
        businessName={businessProfile.businessName}
        businessLogo={businessProfile.logo}
      />

      {/* Identity */}
      <div className={`${ui.cardShell} p-4`}>
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
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className={`truncate text-xl font-bold ${ac.pageHeading}`}>{businessProfile.businessName}</h2>
              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${ui.limeBg} text-[#1a1a1a]`}>
                {planBadgeLabel}
              </span>
            </div>
            {businessProfile.city ? (
              <p className={`mb-1 text-sm ${ac.mutedText}`}>{businessProfile.city}</p>
            ) : null}
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

        {businessProfile.description ? (
          <p className={`mb-4 line-clamp-4 text-sm leading-relaxed ${ac.mutedText}`}>
            {businessProfile.description}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button type="button" onClick={onPreviewProfile} className={`${ui.btnOutline} flex-1`}>
            <Eye size={18} />
            {t('businessProfile.owner.viewProfile')}
          </button>
          <button
            type="button"
            onClick={onEditBusiness}
            aria-label={t('businessProfile.editTitle')}
            className={ui.btnIconOutline}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Tariff / subscription */}
      <div className={`${ui.cardShell} p-4`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className={`text-sm font-semibold ${ac.pageHeading}`}>
              {t('businessProfile.owner.yourPlan', { plan: planBadgeLabel })}
            </p>
            <p className={`mt-1 text-xs font-medium ${ui.limeText}`}>
              {isPro && renewalDate
                ? t('businessProfile.owner.statusActiveUntil', { date: renewalDate })
                : t('businessProfile.owner.statusActive')}
            </p>
          </div>
        </div>

        {isPro ? (
          <>
            {renewalDate ? (
              <p className={`mb-3 text-sm ${ac.mutedText}`}>
                {(businessProfile.subscriptionAutoRenew ?? true)
                  ? t('businessProfile.subscription.renewsOn', { date: renewalDate })
                  : t('businessProfile.subscription.validUntil', { date: renewalDate })}
              </p>
            ) : null}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <p className={`text-xs ${ac.mutedText}`}>{t('businessProfile.owner.highlightLeft')}</p>
                <p className={`text-sm font-bold tabular-nums ${ac.pageHeading}`}>
                  {highlightRemaining} / {planCredits.highlight}
                </p>
              </div>
              <div>
                <p className={`text-xs ${ac.mutedText}`}>{t('businessProfile.owner.topLeft')}</p>
                <p className={`text-sm font-bold tabular-nums ${ac.pageHeading}`}>
                  {topRemaining} / {planCredits.top}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className={`mb-1 text-sm font-semibold ${ac.pageHeading}`}>
              {t('businessProfile.owner.freeProfileTitle')}
            </p>
            <p className={`mb-3 text-sm leading-relaxed ${ac.mutedText}`}>
              {t('businessProfile.owner.freeProfileDescription')}
            </p>
          </>
        )}

        <div className={`mb-4 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm ${ui.limeBgSoft}`}>
          <span className={ac.pageHeading}>{t('businessProfile.owner.promoDiscountRow')}</span>
          <span className={`font-bold tabular-nums ${ui.limeText}`}>{promoDiscount}%</span>
        </div>

        <button type="button" onClick={onManageSubscription} className={`${ui.btnOutline} w-full`}>
          {isPro ? t('businessProfile.owner.manageSubscription') : t('businessProfile.owner.manageTariff')}
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 30-day stats */}
      <div className={ui.cardShell}>
        <div className={`flex items-center justify-between border-b px-4 py-3 ${ui.divider}`}>
          <h3 className={`text-sm font-semibold ${ac.pageHeading}`}>{t('businessProfile.owner.results30days')}</h3>
          {onViewAllStats ? (
            <button type="button" onClick={onViewAllStats} className={`text-xs font-semibold ${ui.limeText}`}>
              {t('businessProfile.owner.seeAll')} ›
            </button>
          ) : (
            <span className={`text-xs font-medium ${ui.limeText}`}>{t('businessProfile.owner.seeAll')} ›</span>
          )}
        </div>
        <div className={`grid grid-cols-4 divide-x ${ui.divider}`}>
          {kpiItems.map(({ key, value, icon: Icon }) => (
            <div key={key} className="px-1 py-4 text-center">
              <Icon size={16} className={`mx-auto mb-2 ${ui.limeText}`} />
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
      <div className={ui.cardShell}>
        <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${ui.divider}`}>
          <h3 className={`text-sm font-semibold ${ac.pageHeading}`}>{t('businessProfile.owner.myListings')}</h3>
          {onCreateListing && (
            <button type="button" onClick={onCreateListing} className={ui.btnOutlineSm}>
              + {t('businessProfile.owner.addListing')}
            </button>
          )}
        </div>

        <div className={`flex gap-1 border-b p-2 ${ui.divider}`}>
          {listingTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onListingTabChange(tab.id)}
              className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
                listingTab === tab.id ? ui.tabActive : ui.tabIdle
              }`}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>

        <div className="p-3">
          <button type="button" onClick={onPromoteListings} className={`${ui.btnSolid} mb-3 w-full`}>
            <Rocket size={18} />
            {t('businessProfile.owner.promoteListings')}
          </button>

          <div className="space-y-3">{renderListings()}</div>

          {hasMoreListings && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className={`mt-3 flex w-full items-center justify-center gap-1 py-2 text-sm font-semibold ${ui.limeText}`}
            >
              {t('businessProfile.owner.allListings')} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
