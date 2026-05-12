'use client';

import { Users, ListPlus } from 'lucide-react';
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
    const id = setInterval(() => void load(), 120_000);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';
  const fmt = (n: number) => n.toLocaleString(locale);

  const pill =
    isLight
      ? 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-3 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3.5'
      : 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white shadow-sm sm:text-sm sm:px-3.5';

  const iconClass =
    isLight ? 'shrink-0 text-[#3F5331]' : 'shrink-0 text-[#C8E6A0]';

  const online = stats?.online ?? null;
  const listings = stats?.newListingsToday ?? null;

  return (
    <div className="flex w-full flex-wrap gap-2 sm:gap-2.5">
      <div className={pill} role="status">
        <span className={iconClass} aria-hidden>
          <Users size={16} strokeWidth={2.25} />
        </span>
        <span className={`min-w-0 leading-snug ${ac.pageHeading}`}>
          <span className="font-semibold tabular-nums">
            {online === null ? '…' : fmt(online)}
          </span>
          <span className={`font-normal ${ac.mutedText}`}> {t('bazaar.activityOnlineSuffix')}</span>
        </span>
        <span
          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]"
          aria-hidden
        />
      </div>
      <div className={pill} role="status">
        <span className={iconClass} aria-hidden>
          <ListPlus size={16} strokeWidth={2.25} />
        </span>
          <span className={`min-w-0 leading-snug ${ac.pageHeading}`}>
          <span
            className={`inline-block min-w-[4.5ch] font-semibold tabular-nums ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`}
          >
            {listings === null ? '…' : `+${fmt(listings)}`}
          </span>
          <span className={`font-normal ${ac.mutedText}`}>
            {' '}
            {t('bazaar.activityListingsTail')}
          </span>
        </span>
      </div>
    </div>
  );
}
