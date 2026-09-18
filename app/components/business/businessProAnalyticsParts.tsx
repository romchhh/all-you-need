'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';

export function ChangeBadge({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        positive ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      <Icon size={12} />
      {positive ? '+' : ''}
      {value}%
    </span>
  );
}

export function AreaLineChart({ values, isLight }: { values: number[]; isLight: boolean }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (v / max) * 72 - 8;
      return `${x},${y}`;
    })
    .join(' ');
  const area = `0,100 ${points} 100,100`;
  const stroke = isLight ? '#3F5331' : '#C8E6A0';
  const fill = isLight ? 'rgba(63,83,49,0.18)' : 'rgba(200,230,160,0.18)';

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full">
      <polygon fill={fill} points={area} />
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" points={points} />
    </svg>
  );
}

export function DonutChart({ segments }: { segments: Array<{ pct: number }> }) {
  const colors = ['#C8E6A0', '#8FBF63', '#6E9450', '#4E6838', '#334824', '#1E2A16'];
  let offset = 0;
  return (
    <div className="relative mx-auto h-28 w-28 shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        {segments.map((seg, i) => {
          const el = (
            <circle
              key={i}
              cx="18"
              cy="18"
              r="15.9"
              fill="transparent"
              stroke={colors[i] || colors[0]}
              strokeWidth="4.2"
              strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
              strokeDashoffset={-offset}
            />
          );
          offset += seg.pct;
          return el;
        })}
      </svg>
    </div>
  );
}

export type AnalyticsPayload = {
  period: 7 | 30 | 90;
  isPro: boolean;
  metrics: {
    listingViews: number;
    profileViews: number;
    contactClicks: number;
    favoritesTotal: number;
    followersCount: number;
    reviewsCount: number;
  };
  changes: Record<string, number>;
  funnel: {
    impressions: number;
    listingViews: number;
    profileViews: number;
    inquiries: number;
  };
  listingRows: Array<{
    id: number;
    title: string;
    price: string;
    isFree: boolean;
    currency: string | null;
    image: string | null;
    views: number;
    favoritesCount: number;
    inquiriesEstimate: number;
    changePct: number;
    promotionType: string | null;
  }>;
  promotionSummary: { used: number; reach: number; views: number; inquiries: number };
  efficiency: { highlighted: number; top_category: number; vip: number };
  promotionHistory: Array<{
    id: number;
    promotionType: string;
    promotionLabel: string;
    listingTitle: string;
    image: string | null;
    startsAt: string;
    endsAt: string | null;
    views: number;
    favorites: number;
  }>;
  trafficSources: Array<{ key: string; pct: number }>;
  contactChannels: { telegram: number; phone: number; instagram: number; website: number };
};
