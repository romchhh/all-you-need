'use client';

import { Users, Package } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

type HomeActivityStatsProps = {
  isLight: boolean;
};

type ActivityPayload = {
  online: number;
  newListingsToday: number;
};

export function HomeActivityStats({ isLight }: HomeActivityStatsProps) {
  const { t, language } = useLanguage();
  const ac = getAppearanceClasses(isLight);
  const [stats, setStats] = useState<ActivityPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/home-activity', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as ActivityPayload;
      if (typeof data.online === 'number' && typeof data.newListingsToday === 'number') {
        setStats({ online: data.online, newListingsToday: data.newListingsToday });
      }
    } catch {
      /* keep previous stats */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void load();
    };
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';
  const fmt = (n: number) => n.toLocaleString(locale);

  const pillOnline =
    isLight
      ? 'flex shrink-0 max-w-[min(11.5rem,calc(50%-6px))] items-center gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-2.5 py-1.5 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3 sm:py-2'
      : 'flex shrink-0 max-w-[min(11.5rem,calc(50%-6px))] items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white shadow-sm sm:text-sm sm:px-3 sm:py-2';

  const pillListings =
    isLight
      ? 'flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-3 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3.5'
      : 'flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white shadow-sm sm:text-sm sm:px-3.5';

  const iconClass =
    isLight ? 'shrink-0 text-[#3F5331]' : 'shrink-0 text-[#C8E6A0]';

  const numClass = `font-semibold tabular-nums ${ac.pageHeading}`;

  const online = stats?.online ?? null;
  const listings = stats?.newListingsToday ?? null;

  return (
    <div className="flex w-full flex-wrap gap-2 sm:gap-2.5">
      <div className={pillOnline} role="status">
        <span
          className={
            isLight
              ? 'h-2.5 w-2.5 shrink-0 rounded-full bg-[#22e078] shadow-[0_0_10px_3px_rgba(34,224,120,0.55),0_0_20px_4px_rgba(34,224,120,0.25)] ring-2 ring-[#22e078]/35'
              : 'h-2.5 w-2.5 shrink-0 rounded-full bg-[#C8E6A0] shadow-[0_0_12px_4px_rgba(200,230,160,0.75),0_0_28px_6px_rgba(200,230,160,0.38)] ring-2 ring-[#C8E6A0]/50'
          }
          aria-hidden
        />
        <span className={`ml-1 flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1 gap-y-0.5 leading-snug`}>
          <span className={numClass}>{online === null ? '…' : fmt(online)}</span>
          <span className={`inline font-normal ${ac.mutedText}`}>{t('bazaar.activityOnlineSuffix')}</span>
        </span>
        <span className={`${iconClass} ml-0.5 shrink-0`} aria-hidden>
          <Users size={16} strokeWidth={2.25} />
        </span>
      </div>
      <div className={pillListings} role="status">
        <span className={`${iconClass} mt-0.5 shrink-0`} aria-hidden>
          <Package size={16} strokeWidth={2.25} />
        </span>
        <span className={`min-w-0 flex-1 leading-snug`}>
          <span className={numClass}>{listings === null ? '…' : `+${fmt(listings)}`}</span>{' '}
          <span className={`break-words font-normal ${ac.mutedText}`}>{t('bazaar.activityListingsTail')}</span>
        </span>
      </div>
    </div>
  );
}
