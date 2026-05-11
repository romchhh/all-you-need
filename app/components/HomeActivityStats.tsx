'use client';

import { Users, ListPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFakeHomeStats } from '@/utils/fakeHomeStats';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

type HomeActivityStatsProps = {
  isLight: boolean;
};

export function HomeActivityStats({ isLight }: HomeActivityStatsProps) {
  const { t, language } = useLanguage();
  const ac = getAppearanceClasses(isLight);
  const [stats, setStats] = useState(() => getFakeHomeStats());

  useEffect(() => {
    const refresh = () => setStats(getFakeHomeStats());
    const id = setInterval(refresh, 45_000);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';
  const fmt = (n: number) => n.toLocaleString(locale);

  const pill =
    isLight
      ? 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-3 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3.5'
      : 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white shadow-sm sm:text-sm sm:px-3.5';

  const iconWrap =
    isLight
      ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3F5331]/12 text-[#3F5331]'
      : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3F5331]/35 text-[#C8E6A0]';

  return (
    <div className="flex w-full flex-wrap gap-2 sm:gap-2.5">
      <div className={pill} role="status">
        <span className={iconWrap} aria-hidden>
          <Users size={16} strokeWidth={2.25} />
        </span>
        <span className={`min-w-0 leading-snug ${ac.pageHeading}`}>
          <span className="font-semibold tabular-nums">{fmt(stats.online)}</span>
          <span className={`font-normal ${ac.mutedText}`}> {t('bazaar.activityOnlineSuffix')}</span>
        </span>
        <span
          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]"
          aria-hidden
        />
      </div>
      <div className={pill} role="status">
        <span className={iconWrap} aria-hidden>
          <ListPlus size={16} strokeWidth={2.25} />
        </span>
        <span className={`min-w-0 leading-snug ${ac.pageHeading}`}>
          <span className={`font-medium ${ac.mutedText}`}>{t('bazaar.activityListingsPrefix')} </span>
          <span
            className={`font-semibold tabular-nums ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`}
          >
            +{fmt(stats.listingsLastDay)}
          </span>
          <span className={`font-normal ${ac.mutedText}`}> {t('bazaar.activityListingsSuffix')}</span>
        </span>
      </div>
    </div>
  );
}
