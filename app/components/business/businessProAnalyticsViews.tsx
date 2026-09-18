'use client';

import {
  Eye,
  Globe,
  Heart,
  Instagram,
  Lightbulb,
  MessageCircle,
  Phone,
  Send,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { ListingImagePlaceholder } from '@/components/listing/ListingImagePlaceholder';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import {
  AreaLineChart,
  ChangeBadge,
  DonutChart,
  type AnalyticsPayload,
} from '@/components/business/businessProAnalyticsParts';

type ListingSort = 'inquiries' | 'views' | 'favorites';

function ListingThumb({ image, title }: { image: string | null; title: string }) {
  const { isLight } = useTheme();
  const resolved = image ? getResolvedImageUrl(image) : null;

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
      {resolved ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolved} alt={title} className="h-full w-full object-cover" />
      ) : (
        <ListingImagePlaceholder isLight={isLight} size="sm" />
      )}
    </div>
  );
}

function formatDateRange(startIso: string, endIso: string | null, lang: string): string {
  const locale = lang === 'ru' ? 'ru-RU' : 'uk-UA';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (Number.isNaN(start.getTime())) return '';
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return end && !Number.isNaN(end.getTime()) ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

function formatPrice(row: AnalyticsPayload['listingRows'][0], lang: string): string {
  if (row.isFree) return lang === 'ru' ? 'Бесплатно' : 'Безкоштовно';
  const num = Number.parseFloat(row.price);
  const formatted = Number.isFinite(num)
    ? num.toLocaleString(lang === 'ru' ? 'ru-RU' : 'uk-UA', { maximumFractionDigits: 0 })
    : row.price;
  return `${formatted}${row.currency ? ` ${row.currency}` : ' €'}`;
}

function trafficSourceLabel(key: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    main: 'businessProfile.analytics.sourceMain',
    category: 'businessProfile.analytics.sourceCategory',
    search: 'businessProfile.analytics.sourceSearch',
    profile: 'businessProfile.analytics.sourceProfile',
    other: 'businessProfile.analytics.sourceOther',
  };
  return t(map[key] || 'businessProfile.analytics.sourceOther');
}

export function AnalyticsOverviewTab({ data }: { data: AnalyticsPayload }) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';

  const chartValues = useMemo(() => {
    const base = Math.max(data.metrics.listingViews, 1);
    return Array.from({ length: 10 }, (_, i) => Math.round(base * (0.35 + (i / 9) * 0.65)));
  }, [data.metrics.listingViews]);

  const dynamics = [
    { key: 'listingViews', label: t('businessProfile.analytics.listingViews'), value: data.metrics.listingViews, change: data.changes.listingViews },
    { key: 'profileViews', label: t('businessProfile.analytics.profileViews'), value: data.metrics.profileViews, change: data.changes.profileViews },
    { key: 'contactClicks', label: t('businessProfile.analytics.inquiries'), value: data.metrics.contactClicks, change: data.changes.contactClicks },
    { key: 'favoritesTotal', label: t('businessProfile.owner.kpiFavorites'), value: data.metrics.favoritesTotal, change: data.changes.favoritesTotal },
    { key: 'reviewsCount', label: t('businessProfile.owner.kpiReviews'), value: data.metrics.reviewsCount, change: data.changes.reviewsCount },
    { key: 'followersCount', label: t('businessProfile.analytics.newFollowers'), value: data.metrics.followersCount, change: data.changes.followersCount },
  ];

  const funnelSteps = [
    { label: t('businessProfile.analytics.impressions'), value: data.funnel.impressions, width: 100 },
    {
      label: t('businessProfile.analytics.listingViews'),
      value: data.funnel.listingViews,
      width: Math.max(18, (data.funnel.listingViews / Math.max(data.funnel.impressions, 1)) * 100),
    },
    {
      label: t('businessProfile.analytics.profileViews'),
      value: data.funnel.profileViews,
      width: Math.max(10, (data.funnel.profileViews / Math.max(data.funnel.impressions, 1)) * 100),
    },
    {
      label: t('businessProfile.analytics.inquiries'),
      value: data.funnel.inquiries,
      width: Math.max(6, (data.funnel.inquiries / Math.max(data.funnel.impressions, 1)) * 100),
    },
  ];

  const contactItems = [
    { icon: Send, label: 'Telegram', count: data.contactChannels.telegram },
    { icon: Phone, label: t('businessProfile.public.call'), count: data.contactChannels.phone },
    { icon: Instagram, label: 'Instagram', count: data.contactChannels.instagram },
    { icon: Globe, label: t('businessProfile.public.website'), count: data.contactChannels.website },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.dynamicsTitle', { days: String(data.period) })}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {dynamics.slice(0, 4).map(({ label, value, change }) => (
            <div key={label} className={`${ui.cardShell} p-3`}>
              <div className="mb-1 flex items-start justify-between gap-1">
                <p className={`text-xl font-bold tabular-nums ${ac.pageHeading}`}>
                  {value.toLocaleString(locale)}
                </p>
                <ChangeBadge value={change} />
              </div>
              <p className={`text-[11px] leading-tight ${ac.mutedText}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${ui.cardShell} p-4`}>
        <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.stats.chartTitle')}
        </p>
        <AreaLineChart values={chartValues} isLight={isLight} />
      </div>

      <div className={`${ui.cardShell} divide-y ${ui.divider}`}>
        {dynamics.map(({ label, value, change }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <span className={`flex-1 text-sm ${ac.pageHeading}`}>{label}</span>
            <ChangeBadge value={change} />
            <span className={`text-sm font-bold tabular-nums ${ac.pageHeading}`}>
              {value.toLocaleString(locale)}
            </span>
          </div>
        ))}
      </div>

      <div className={`${ui.cardShell} p-4`}>
        <p className={`mb-3 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.funnelTitle')}
        </p>
        <div className="space-y-3">
          {funnelSteps.map((step) => (
            <div key={step.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className={ac.mutedText}>{step.label}</span>
                <span className={`font-semibold tabular-nums ${ac.pageHeading}`}>
                  {step.value.toLocaleString(locale)}
                </span>
              </div>
              <div className={`h-2 overflow-hidden rounded-full ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                <div className={`h-full rounded-full ${ui.limeBg}`} style={{ width: `${step.width}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${ui.cardShell} p-4`}>
        <p className={`mb-3 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.trafficTitle')}
        </p>
        <div className="flex items-center gap-4">
          <DonutChart segments={data.trafficSources} />
          <div className="min-w-0 flex-1 space-y-2">
            {data.trafficSources.map((source) => (
              <div key={source.key} className="flex items-center justify-between gap-2 text-xs">
                <span className={`truncate ${ac.mutedText}`}>{trafficSourceLabel(source.key, t)}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${ac.pageHeading}`}>{source.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.contactChannelsTitle')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {contactItems.map(({ icon: Icon, label, count }) => (
            <div key={label} className={`${ui.cardShell} p-3 text-center`}>
              <Icon size={18} className={`mx-auto mb-2 ${ui.limeText}`} />
              <p className={`text-lg font-bold tabular-nums ${ac.pageHeading}`}>{count}</p>
              <p className={`mt-1 text-[11px] ${ac.mutedText}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${ui.cardShell} p-4`}>
        <p className={`mb-3 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.profileStatsTitle')}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: Eye, label: t('businessProfile.stats.profileViews'), value: data.metrics.profileViews },
            { icon: Users, label: t('businessProfile.analytics.newFollowers'), value: data.metrics.followersCount },
            { icon: MessageCircle, label: t('businessProfile.analytics.inquiries'), value: data.metrics.contactClicks },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <Icon size={16} className={`mx-auto mb-1 ${ui.limeText}`} />
              <p className={`text-base font-bold tabular-nums ${ac.pageHeading}`}>
                {value.toLocaleString(locale)}
              </p>
              <p className={`mt-0.5 text-[10px] leading-tight ${ac.mutedText}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${ui.limeBorder} ${ui.limeBgSoft}`}>
        <Lightbulb size={18} className={`mt-0.5 shrink-0 ${ui.limeText}`} />
        <div>
          <p className={`text-xs font-semibold ${ui.limeText}`}>{t('businessProfile.analytics.tipTitle')}</p>
          <p className={`mt-1 text-sm leading-relaxed ${ac.pageHeading}`}>{t('businessProfile.stats.tip')}</p>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsListingsTab({ data }: { data: AnalyticsPayload }) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const [sort, setSort] = useState<ListingSort>('inquiries');

  const sorted = useMemo(() => {
    const rows = [...data.listingRows];
    if (sort === 'views') rows.sort((a, b) => b.views - a.views);
    else if (sort === 'favorites') rows.sort((a, b) => b.favoritesCount - a.favoritesCount);
    else rows.sort((a, b) => b.inquiriesEstimate - a.inquiriesEstimate);
    return rows.slice(0, 8);
  }, [data.listingRows, sort]);

  const sortOptions: ListingSort[] = ['inquiries', 'views', 'favorites'];

  return (
    <div className="space-y-4">
      <div className={`flex gap-1 rounded-xl p-1 ${isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'}`}>
        {sortOptions.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
              sort === id ? ui.tabActive : ui.tabIdle
            }`}
          >
            {t(`businessProfile.analytics.listingSort.${id}`)}
          </button>
        ))}
      </div>

      <p className={`text-sm font-semibold ${ac.pageHeading}`}>{t('businessProfile.analytics.bestListings')}</p>

      {sorted.length === 0 ? (
        <div className={`${ui.cardShell} p-6 text-center text-sm ${ac.mutedText}`}>
          {t('businessProfile.analytics.noListings')}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((row, index) => (
            <div key={row.id} className={`${ui.cardShell} flex items-center gap-3 p-3`}>
              <span className={`w-5 shrink-0 text-center text-xs font-bold ${ac.mutedText}`}>{index + 1}</span>
              <ListingThumb image={row.image} title={row.title} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${ac.pageHeading}`}>{row.title}</p>
                <p className={`text-xs font-semibold ${ui.limeText}`}>{formatPrice(row, language)}</p>
                <div className={`mt-1 flex flex-wrap gap-2 text-[10px] ${ac.mutedText}`}>
                  <span className="inline-flex items-center gap-0.5">
                    <Eye size={10} /> {row.views}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Heart size={10} /> {row.favoritesCount}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <MessageCircle size={10} /> {row.inquiriesEstimate}
                  </span>
                </div>
              </div>
              <ChangeBadge value={row.changePct} />
            </div>
          ))}
        </div>
      )}

      <button type="button" className={`${ui.btnOutline} w-full`}>
        {t('businessProfile.analytics.allListings')}
      </button>
    </div>
  );
}

export function AnalyticsPromotionTab({ data }: { data: AnalyticsPayload }) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';

  const efficiencyRows = [
    { key: 'highlighted', label: 'Highlight', pct: data.efficiency.highlighted },
    { key: 'top_category', label: 'TOP', pct: data.efficiency.top_category },
    { key: 'vip', label: 'VIP', pct: data.efficiency.vip },
  ];

  return (
    <div className="space-y-4">
      <div className={`${ui.cardShell} p-4`}>
        <p className={`text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.promotionsUsed', { count: String(data.promotionSummary.used) })}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: t('businessProfile.analytics.reach'), value: data.promotionSummary.reach },
            { label: t('businessProfile.analytics.listingViews'), value: data.promotionSummary.views },
            { label: t('businessProfile.analytics.inquiries'), value: data.promotionSummary.inquiries },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className={`text-base font-bold tabular-nums ${ac.pageHeading}`}>
                {value.toLocaleString(locale)}
              </p>
              <p className={`mt-0.5 text-[10px] leading-tight ${ac.mutedText}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${ui.cardShell} p-4`}>
        <p className={`mb-3 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.efficiencyTitle')}
        </p>
        <div className="space-y-3">
          {efficiencyRows.map((row) => (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={`inline-flex items-center gap-1 ${ac.pageHeading}`}>
                  <Zap size={12} className={ui.limeText} />
                  {row.label}
                </span>
                <span className={`font-semibold ${ui.limeText}`}>+{row.pct}%</span>
              </div>
              <div className={`h-2 overflow-hidden rounded-full ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                <div className={`h-full rounded-full ${ui.limeBg}`} style={{ width: `${Math.min(row.pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.promotionHistory')}
        </p>
        {data.promotionHistory.length === 0 ? (
          <div className={`${ui.cardShell} p-6 text-center text-sm ${ac.mutedText}`}>
            {t('businessProfile.analytics.noPromotions')}
          </div>
        ) : (
          <div className="space-y-2">
            {data.promotionHistory.map((item) => (
              <div key={item.id} className={`${ui.cardShell} flex items-center gap-3 p-3`}>
                <ListingThumb image={item.image} title={item.listingTitle} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${ac.pageHeading}`}>{item.listingTitle}</p>
                  <p className={`text-[11px] ${ac.mutedText}`}>
                    {formatDateRange(item.startsAt, item.endsAt, language)}
                  </p>
                  <div className={`mt-1 flex flex-wrap gap-2 text-[10px] ${ac.mutedText}`}>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.limeBgSoft} ${ui.limeText}`}>
                      {item.promotionLabel}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye size={10} /> {item.views}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Star size={10} /> {item.favorites}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
