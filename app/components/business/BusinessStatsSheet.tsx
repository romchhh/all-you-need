'use client';

import {
  ChevronLeft,
  Eye,
  Heart,
  Instagram,
  Lightbulb,
  MessageCircle,
  Phone,
  Send,
  Star,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import type { BusinessProfileStatsPayload } from '@/lib/businessProfileConstants';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import type { BusinessProfileData } from '@/components/business/BusinessOwnerProfileView';

type StatsPeriod = 7 | 30 | 90;
type StatsTab = 'overview' | 'listings' | 'promotion';

interface BusinessStatsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  businessStats: BusinessProfileStatsPayload;
  businessProfile: BusinessProfileData;
}

function scaleStat(value: number, period: StatsPeriod): number {
  const factor = period / 30;
  return Math.max(0, Math.round(value * factor));
}

function MiniLineChart({ values, isLight }: { values: number[]; isLight: boolean }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (v / max) * 80 - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full">
      <polyline
        fill="none"
        stroke={isLight ? '#3F5331' : '#C8E6A0'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function BusinessStatsSheet({
  isOpen,
  onClose,
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

  useBodyScrollLock(isOpen);
  useHideBottomNav(isOpen);

  const scaled = useMemo(
    () => ({
      listingViews: scaleStat(businessStats.listingViews, period),
      profileViews: scaleStat(businessStats.profileViews, period),
      contactClicks: scaleStat(businessStats.contactClicks, period),
      favoritesTotal: scaleStat(businessStats.favoritesTotal, period),
    }),
    [businessStats, period]
  );

  const chartValues = useMemo(() => {
    const base = Math.max(scaled.listingViews, 1);
    return Array.from({ length: 8 }, (_, i) => Math.round(base * (0.45 + (i / 7) * 0.55)));
  }, [scaled.listingViews]);

  const funnel = useMemo(() => {
    const impressions = Math.max(scaled.listingViews * 2, scaled.listingViews + 100);
    const listingViews = scaled.listingViews;
    const profileViews = scaled.profileViews;
    const inquiries = scaled.contactClicks;
    return [
      { label: t('businessProfile.analytics.impressions'), value: impressions, width: 100 },
      { label: t('businessProfile.analytics.listingViews'), value: listingViews, width: Math.max(18, (listingViews / impressions) * 100) },
      { label: t('businessProfile.analytics.profileViews'), value: profileViews, width: Math.max(10, (profileViews / impressions) * 100) },
      { label: t('businessProfile.analytics.inquiries'), value: inquiries, width: Math.max(6, (inquiries / impressions) * 100) },
    ];
  }, [scaled, t]);

  const trafficSources = [
    { label: t('businessProfile.analytics.sourceMain'), pct: 31 },
    { label: t('businessProfile.analytics.sourceCategory'), pct: 27 },
    { label: t('businessProfile.analytics.sourceSearch'), pct: 21 },
    { label: t('businessProfile.analytics.sourceSimilar'), pct: 11 },
    { label: t('businessProfile.analytics.sourceProfile'), pct: 6 },
    { label: t('businessProfile.analytics.sourceOther'), pct: 4 },
  ];

  const contactChannels = [
    { icon: Send, label: 'Telegram', count: businessProfile.telegram ? scaled.contactClicks : 0, enabled: !!businessProfile.telegram },
    { icon: Phone, label: t('businessProfile.public.call'), count: businessProfile.phone ? Math.round(scaled.contactClicks * 0.35) : 0, enabled: !!businessProfile.phone },
    { icon: Instagram, label: 'Instagram', count: businessProfile.instagram ? Math.round(scaled.contactClicks * 0.2) : 0, enabled: !!businessProfile.instagram },
    { icon: Eye, label: t('businessProfile.public.website'), count: businessProfile.website ? Math.round(scaled.contactClicks * 0.1) : 0, enabled: !!businessProfile.website },
  ];

  const metricCards = [
    { icon: Eye, label: t('businessProfile.owner.kpiViews'), value: scaled.listingViews + scaled.profileViews },
    { icon: Eye, label: t('businessProfile.stats.profileViews'), value: scaled.profileViews },
    { icon: MessageCircle, label: t('businessProfile.owner.kpiInquiries'), value: scaled.contactClicks },
    { icon: Heart, label: t('businessProfile.owner.kpiFavorites'), value: scaled.favoritesTotal },
    { icon: Star, label: t('businessProfile.owner.kpiReviews'), value: 0 },
  ];

  if (!isOpen) return null;

  const shell = isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0a] text-white';
  const periods: StatsPeriod[] = [7, 30, 90];

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

          {( !isPro || tab === 'overview') && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {metricCards.slice(0, 4).map(({ icon: Icon, label, value }) => (
                  <div key={label} className={`${ui.cardShell} p-3`}>
                    <Icon size={16} className={`mb-2 ${ui.limeText}`} />
                    <p className={`text-xl font-bold tabular-nums ${ac.pageHeading}`}>
                      {value.toLocaleString(language === 'ru' ? 'ru-RU' : 'uk-UA')}
                    </p>
                    <p className={`mt-1 text-[11px] leading-tight ${ac.mutedText}`}>{label}</p>
                  </div>
                ))}
              </div>

              <div className={`${ui.cardShell} mb-4 p-4`}>
                <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
                  {t('businessProfile.stats.chartTitle')}
                </p>
                <MiniLineChart values={chartValues} isLight={isLight} />
              </div>

              <div className={`${ui.cardShell} mb-4 divide-y ${ui.divider}`}>
                {metricCards.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3">
                    <Icon size={16} className={ui.limeText} />
                    <span className={`flex-1 text-sm ${ac.pageHeading}`}>{label}</span>
                    <span className={`text-sm font-bold tabular-nums ${ac.pageHeading}`}>
                      {value.toLocaleString(language === 'ru' ? 'ru-RU' : 'uk-UA')}
                    </span>
                  </div>
                ))}
              </div>

              <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${ui.limeBorder} ${ui.limeBgSoft}`}>
                <Lightbulb size={18} className={`mt-0.5 shrink-0 ${ui.limeText}`} />
                <p className={`text-sm leading-relaxed ${ac.pageHeading}`}>{t('businessProfile.stats.tip')}</p>
              </div>
            </>
          )}

          {isPro && tab === 'listings' && (
            <div className={`${ui.cardShell} p-4`}>
              <p className={`mb-3 text-sm font-semibold ${ac.pageHeading}`}>{t('businessProfile.analytics.funnelTitle')}</p>
              <div className="space-y-3">
                {funnel.map((step) => (
                  <div key={step.label}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className={ac.mutedText}>{step.label}</span>
                      <span className={`font-semibold tabular-nums ${ac.pageHeading}`}>
                        {step.value.toLocaleString(language === 'ru' ? 'ru-RU' : 'uk-UA')}
                      </span>
                    </div>
                    <div className={`h-2 overflow-hidden rounded-full ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                      <div className={`h-full rounded-full ${ui.limeBg}`} style={{ width: `${step.width}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isPro && tab === 'promotion' && (
            <div className="space-y-4">
              <div className={`${ui.cardShell} p-4`}>
                <p className={`mb-3 text-sm font-semibold ${ac.pageHeading}`}>
                  {t('businessProfile.analytics.trafficTitle')}
                </p>
                <div className="space-y-2">
                  {trafficSources.map((source) => (
                    <div key={source.label} className="flex items-center gap-3">
                      <span className={`w-28 shrink-0 text-xs ${ac.mutedText}`}>{source.label}</span>
                      <div className={`h-2 flex-1 overflow-hidden rounded-full ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                        <div className={`h-full rounded-full ${ui.limeBg}`} style={{ width: `${source.pct}%` }} />
                      </div>
                      <span className={`w-10 text-right text-xs font-semibold tabular-nums ${ac.pageHeading}`}>
                        {source.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {contactChannels.filter((c) => c.enabled).map(({ icon: Icon, label, count }) => (
                  <div key={label} className={`${ui.cardShell} p-3 text-center`}>
                    <Icon size={18} className={`mx-auto mb-2 ${ui.limeText}`} />
                    <p className={`text-lg font-bold tabular-nums ${ac.pageHeading}`}>{count}</p>
                    <p className={`mt-1 text-[11px] ${ac.mutedText}`}>{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
