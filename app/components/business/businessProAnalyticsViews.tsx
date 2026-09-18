'use client';

import {
  Eye,
  Heart,
  Lightbulb,
  MessageCircle,
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
  BusinessContactBrandIcon,
  type BusinessContactChannel,
} from '@/components/business/BusinessContactIcons';
import {
  ChangeBadge,
  DonutChart,
  TRAFFIC_SOURCE_COLORS,
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
    similar: 'businessProfile.analytics.sourceSimilar',
    profile: 'businessProfile.analytics.sourceProfile',
    other: 'businessProfile.analytics.sourceOther',
  };
  return t(map[key] || 'businessProfile.analytics.sourceOther');
}

function AnalyticsTipCard({ text }: { text: string }) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);

  return (
    <div className={`${ui.cardShell} flex items-start gap-3 p-4`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
        <Lightbulb size={20} className="text-amber-400" />
      </div>
      <div>
        <p className={`text-sm font-semibold ${ui.limeText}`}>{t('businessProfile.analytics.tipTitle')}</p>
        <p className={`mt-1 text-sm leading-relaxed ${ac.pageHeading}`}>{text}</p>
      </div>
    </div>
  );
}

export function AnalyticsOverviewTab({ data }: { data: AnalyticsPayload }) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';

  const totalViews = data.metrics.listingViews + data.metrics.profileViews;

  const contactItems: Array<{
    channel: BusinessContactChannel;
    label: string;
    count: number;
    change: number;
  }> = [
    {
      channel: 'telegram',
      label: 'Telegram',
      count: data.contactChannels.telegram,
      change: data.contactChannelChanges.telegram,
    },
    {
      channel: 'phone',
      label: t('businessProfile.fields.phone'),
      count: data.contactChannels.phone,
      change: data.contactChannelChanges.phone,
    },
    {
      channel: 'instagram',
      label: 'Instagram',
      count: data.contactChannels.instagram,
      change: data.contactChannelChanges.instagram,
    },
    {
      channel: 'website',
      label: t('businessProfile.fields.website'),
      count: data.contactChannels.website,
      change: data.contactChannelChanges.website,
    },
  ];

  const profileStats = [
    {
      icon: Eye,
      value: data.metrics.profileViews,
      label: t('businessProfile.analytics.profileViewsShort'),
      change: data.changes.profileViews,
      prefix: '',
    },
    {
      icon: Users,
      value: data.metrics.followersCount,
      label: t('businessProfile.analytics.newFollowersShort'),
      change: data.changes.followersCount,
      prefix: '+',
    },
    {
      icon: MessageCircle,
      value: data.metrics.contactClicks,
      label: t('businessProfile.analytics.inquiriesShort'),
      change: data.changes.contactClicks,
      prefix: '',
    },
  ];

  return (
    <div className="space-y-5">
      <div className={`${ui.cardShell} p-4`}>
        <p className={`mb-4 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.viewSourcesTitle')}
        </p>
        <div className="flex items-center gap-4">
          <DonutChart
            segments={data.trafficSources}
            centerValue={totalViews}
            centerLabel={t('businessProfile.analytics.viewsCountLabel')}
            locale={locale}
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            {data.trafficSources.map((source, i) => (
              <div key={source.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TRAFFIC_SOURCE_COLORS[i] || TRAFFIC_SOURCE_COLORS[0] }}
                  />
                  <span className={`truncate ${ac.mutedText}`}>{trafficSourceLabel(source.key, t)}</span>
                </span>
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
        <div className="grid grid-cols-4 gap-2">
          {contactItems.map(({ channel, label, count, change }) => (
            <div key={channel} className={`${ui.cardShell} flex flex-col items-center px-1.5 py-3 text-center`}>
              <BusinessContactBrandIcon channel={channel} size={28} className="mb-2" />
              <p className={`text-base font-bold tabular-nums leading-none ${ac.pageHeading}`}>{count}</p>
              <p className={`mt-1 line-clamp-2 text-[9px] leading-tight ${ac.mutedText}`}>{label}</p>
              <div className="mt-1.5">
                <ChangeBadge value={change} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
          {t('businessProfile.analytics.profileStatsTitle')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {profileStats.map(({ icon: Icon, value, label, change, prefix }) => (
            <div key={label} className={`${ui.cardShell} px-2 py-3 text-center`}>
              <Icon size={16} className={`mx-auto mb-2 ${ui.limeText}`} />
              <p className={`text-base font-bold tabular-nums leading-none ${ac.pageHeading}`}>
                {prefix}
                {value.toLocaleString(locale)}
              </p>
              <p className={`mt-1 line-clamp-2 text-[9px] leading-tight ${ac.mutedText}`}>{label}</p>
              <div className="mt-1.5 flex justify-center">
                <ChangeBadge value={change} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnalyticsTipCard text={t('businessProfile.analytics.proTip')} />
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
