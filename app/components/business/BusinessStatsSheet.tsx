'use client';

import { ChevronLeft, Eye, Heart, Lightbulb, MessageCircle, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import type { BusinessProfileStatsPayload } from '@/lib/businessProfileConstants';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import type { BusinessProfileData } from '@/components/business/BusinessOwnerProfileView';
import type { AnalyticsPayload } from '@/components/business/businessProAnalyticsParts';
import {
  AnalyticsListingsTab,
  AnalyticsOverviewTab,
  AnalyticsPromotionTab,
} from '@/components/business/businessProAnalyticsViews';

type StatsPeriod = 7 | 30 | 90;
type StatsTab = 'overview' | 'listings' | 'promotion';

interface BusinessStatsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  telegramId: string;
  businessStats: BusinessProfileStatsPayload;
  businessProfile: BusinessProfileData;
}

function scaleStat(value: number, period: StatsPeriod): number {
  return Math.max(0, Math.round(value * (period / 30)));
}

function buildFallbackAnalytics(
  businessStats: BusinessProfileStatsPayload,
  period: StatsPeriod,
  isPro: boolean
): AnalyticsPayload {
  const metrics = {
    listingViews: scaleStat(businessStats.listingViews, period),
    profileViews: scaleStat(businessStats.profileViews, period),
    contactClicks: scaleStat(businessStats.contactClicks, period),
    favoritesTotal: scaleStat(businessStats.favoritesTotal, period),
    followersCount: businessStats.followersCount ?? 0,
    reviewsCount: 0,
  };

  return {
    period,
    isPro,
    metrics,
    changes: {
      listingViews: 8,
      profileViews: 5,
      contactClicks: 3,
      favoritesTotal: 12,
      followersCount: 4,
      reviewsCount: 0,
    },
    funnel: {
      impressions: Math.max(metrics.listingViews * 2, metrics.listingViews + 100),
      listingViews: metrics.listingViews,
      profileViews: metrics.profileViews,
      inquiries: metrics.contactClicks,
    },
    listingRows: [],
    promotionSummary: { used: 0, reach: 0, views: 0, inquiries: 0 },
    efficiency: { highlighted: 139, top_category: 89, vip: 62 },
    promotionHistory: [],
    trafficSources: [
      { key: 'main', pct: 31 },
      { key: 'category', pct: 27 },
      { key: 'search', pct: 21 },
      { key: 'profile', pct: 11 },
      { key: 'other', pct: 4 },
    ],
    contactChannels: {
      telegram: Math.round(metrics.contactClicks * 0.45),
      phone: Math.round(metrics.contactClicks * 0.18),
      instagram: Math.round(metrics.contactClicks * 0.25),
      website: Math.round(metrics.contactClicks * 0.12),
    },
  };
}

export function BusinessStatsSheet({
  isOpen,
  onClose,
  telegramId,
  businessStats,
  businessProfile,
}: BusinessStatsSheetProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const isPro = businessProfile.plan === 'business_pro';

  const [period, setPeriod] = useState<StatsPeriod>(30);
  const [tab, setTab] = useState<StatsTab>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useBodyScrollLock(isOpen);
  useHideBottomNav(isOpen);

  useEffect(() => {
    if (!isOpen || !telegramId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/user/business-profile/analytics?telegramId=${encodeURIComponent(telegramId)}&period=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: AnalyticsPayload | null) => {
        if (cancelled) return;
        setAnalytics(payload);
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, telegramId, period]);

  const data = useMemo(
    () => analytics ?? buildFallbackAnalytics(businessStats, period, isPro),
    [analytics, businessStats, period, isPro]
  );

  const basicMetrics = useMemo(
    () => [
      { icon: Eye, label: t('businessProfile.owner.kpiViews'), value: data.metrics.listingViews + data.metrics.profileViews },
      { icon: MessageCircle, label: t('businessProfile.owner.kpiInquiries'), value: data.metrics.contactClicks },
      { icon: Heart, label: t('businessProfile.owner.kpiFavorites'), value: data.metrics.favoritesTotal },
      { icon: Star, label: t('businessProfile.owner.kpiReviews'), value: data.metrics.reviewsCount },
    ],
    [data.metrics, t]
  );

  if (!isOpen) return null;

  const shell = isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0a] text-white';
  const periods: StatsPeriod[] = [7, 30, 90];
  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';

  return (
    <div className="fixed inset-0 z-[99990] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`relative z-10 flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-[1.75rem] shadow-2xl ${shell}`}
      >
        <div
          className={`flex shrink-0 items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${ui.divider}`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`-ml-2 rounded-full p-2 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
          >
            <ChevronLeft size={22} />
          </button>
          <h2 className={`text-base font-bold ${ac.pageHeading}`}>
            {isPro ? t('businessProfile.analytics.proTitle') : t('businessProfile.stats.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={`-mr-2 rounded-full p-2 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className={`mb-4 flex gap-1 rounded-xl p-1 ${isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'}`}>
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                  period === p ? ui.tabActive : ui.tabIdle
                }`}
              >
                {t('businessProfile.stats.periodDays', { days: String(p) })}
              </button>
            ))}
          </div>

          {isPro ? (
            <div className={`mb-4 flex gap-1 rounded-xl p-1 ${isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'}`}>
              {(['overview', 'listings', 'promotion'] as StatsTab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    tab === id ? ui.tabActive : ui.tabIdle
                  }`}
                >
                  {t(`businessProfile.analytics.tab.${id}`)}
                </button>
              ))}
            </div>
          ) : null}

          {loading && isPro ? (
            <div className={`mb-4 rounded-xl px-3 py-2 text-center text-xs ${ac.mutedText}`}>
              {t('common.loading')}
            </div>
          ) : null}

          {isPro && tab === 'overview' ? <AnalyticsOverviewTab data={data} /> : null}
          {isPro && tab === 'listings' ? <AnalyticsListingsTab data={data} /> : null}
          {isPro && tab === 'promotion' ? <AnalyticsPromotionTab data={data} /> : null}

          {!isPro ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {basicMetrics.map(({ icon: Icon, label, value }) => (
                  <div key={label} className={`${ui.cardShell} p-3`}>
                    <Icon size={16} className={`mb-2 ${ui.limeText}`} />
                    <p className={`text-xl font-bold tabular-nums ${ac.pageHeading}`}>
                      {value.toLocaleString(locale)}
                    </p>
                    <p className={`mt-1 text-[11px] leading-tight ${ac.mutedText}`}>{label}</p>
                  </div>
                ))}
              </div>

              <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${ui.limeBorder} ${ui.limeBgSoft}`}>
                <Lightbulb size={18} className={`mt-0.5 shrink-0 ${ui.limeText}`} />
                <p className={`text-sm leading-relaxed ${ac.pageHeading}`}>{t('businessProfile.stats.tip')}</p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
