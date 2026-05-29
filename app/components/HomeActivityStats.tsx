'use client';

import { Users, Package, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

type HomeActivityStatsProps = {
  isLight: boolean;
};

type CityStat = { city: string; count: number };

type ActivityPayload = {
  online: number;
  newListingsToday: number;
  newListingsByCity: CityStat[];
  windowKey: string;
};

export function HomeActivityStats({ isLight }: HomeActivityStatsProps) {
  const { t, language } = useLanguage();
  const ac = getAppearanceClasses(isLight);
  const [stats, setStats] = useState<ActivityPayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const listingsRef = useRef<HTMLDivElement>(null);
  const windowKeyRef = useRef<string>('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/home-activity', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as ActivityPayload;
      if (typeof data.online !== 'number' || typeof data.newListingsToday !== 'number') return;

      const cities = Array.isArray(data.newListingsByCity)
        ? data.newListingsByCity.filter(
            (row) => row && typeof row.city === 'string' && typeof row.count === 'number'
          )
        : [];

      if (data.windowKey && windowKeyRef.current && data.windowKey !== windowKeyRef.current) {
        setMenuOpen(false);
      }
      if (data.windowKey) {
        windowKeyRef.current = data.windowKey;
      }

      setStats({
        online: data.online,
        newListingsToday: data.newListingsToday,
        newListingsByCity: cities,
        windowKey: data.windowKey || '',
      });
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
    const onHomeRefresh = () => void load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('tradeground-home-refresh', onHomeRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('tradeground-home-refresh', onHomeRefresh);
    };
  }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (listingsRef.current && !listingsRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const locale = language === 'ru' ? 'ru-RU' : 'uk-UA';
  const fmt = (n: number) => n.toLocaleString(locale);

  const pillOnline =
    isLight
      ? 'flex shrink-0 max-w-[min(11.5rem,calc(50%-6px))] items-center gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-2.5 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3 sm:py-2'
      : 'flex shrink-0 max-w-[min(11.5rem,calc(50%-6px))] items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-2.5 py-2 text-xs text-white shadow-sm sm:text-sm sm:px-3 sm:py-2';

  const pillListingsBase =
    isLight
      ? 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3.5'
      : 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm sm:text-sm sm:px-3.5';

  const pillListingsIdle = isLight
    ? `${pillListingsBase} border-gray-200/90 bg-white/90`
    : `${pillListingsBase} border-white/12 bg-white/[0.06] text-white`;

  const pillListingsActive = isLight
    ? `${pillListingsBase} border-[#3F5331]/40 bg-white ring-[#3F5331]/15`
    : `${pillListingsBase} border-[#C8E6A0]/35 bg-white/[0.08] text-white ring-[#C8E6A0]/20`;

  const iconClass = isLight ? 'shrink-0 text-[#3F5331]' : 'shrink-0 text-[#C8E6A0]';
  const numClass = `font-semibold tabular-nums ${ac.pageHeading}`;

  const online = stats?.online ?? null;
  const listings = stats?.newListingsToday ?? null;
  const cities = stats?.newListingsByCity ?? [];

  const dropdownPanel = isLight
    ? 'absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-gray-200/90 bg-white py-1.5 shadow-lg ring-1 ring-black/[0.04]'
    : 'absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-white/12 bg-[#1a1a1a] py-1.5 shadow-lg';

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
        <span className="ml-1 flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1 gap-y-0.5 leading-snug">
          <span className={numClass}>{online === null ? '…' : fmt(online)}</span>
          <span className={`inline font-normal ${ac.mutedText}`}>{t('bazaar.activityOnlineSuffix')}</span>
        </span>
        <span className={`${iconClass} ml-0.5 shrink-0`} aria-hidden>
          <Users size={16} strokeWidth={2.25} />
        </span>
      </div>

      <div ref={listingsRef} className="relative min-w-0 flex-1">
        <button
          type="button"
          className={`${menuOpen ? pillListingsActive : pillListingsIdle} w-full text-left transition-colors ${
            stats ? 'cursor-pointer active:opacity-90' : 'cursor-default'
          }`}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          aria-label={t('bazaar.activityListingsByCity')}
          disabled={!stats}
          onClick={() => {
            if (!stats) return;
            setMenuOpen((open) => !open);
          }}
        >
          <span className={`${iconClass} shrink-0`} aria-hidden>
            <Package size={16} strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1 leading-snug">
            <span className={numClass}>{listings === null ? '…' : `+${fmt(listings)}`}</span>{' '}
            <span className={`break-words font-normal ${ac.mutedText}`}>{t('bazaar.activityListingsTail')}</span>
          </span>
          {stats && (
            <ChevronDown
              size={16}
              strokeWidth={2.25}
              className={`shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''} ${ac.mutedText}`}
              aria-hidden
            />
          )}
        </button>

        {menuOpen && stats && (
          <div className={dropdownPanel} role="listbox" aria-label={t('bazaar.activityListingsByCity')}>
            <div
              className={`px-3 pb-1.5 pt-0.5 text-[11px] font-medium uppercase tracking-wide ${ac.mutedText}`}
            >
              {t('bazaar.activityListingsByCity')}
            </div>
            {cities.length === 0 ? (
              <p className={`px-3 py-2 text-sm ${ac.mutedText}`}>{t('bazaar.activityListingsByCityEmpty')}</p>
            ) : (
              <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {cities.map(({ city, count }) => {
                  const label = city ? city : t('bazaar.activityOtherCity');
                  return (
                  <li
                    key={city || '__other__'}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                      isLight ? 'text-gray-900' : 'text-white'
                    }`}
                    role="option"
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    <span className={`shrink-0 tabular-nums font-semibold ${numClass}`}>+{fmt(count)}</span>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
