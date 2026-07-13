'use client';

import { Users, Package, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import {
  fetchHomeActivity,
  getHomeActivityWindowKey,
  HOME_ACTIVITY_CLIENT_TTL_MS,
  onHomeActivityDayRollover,
  readHomeActivityCache,
  type HomeActivityData,
} from '@/utils/homeActivityClient';

type HomeActivityStatsProps = {
  isLight: boolean;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
};

export const HomeActivityStats = memo(function HomeActivityStats({ isLight }: HomeActivityStatsProps) {
  const { t, language } = useLanguage();
  const ac = getAppearanceClasses(isLight);
  const [stats, setStats] = useState<HomeActivityData | null>(() => readHomeActivityCache());
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const listingsRef = useRef<HTMLDivElement>(null);
  const windowKeyRef = useRef<string>(stats?.windowKey ?? '');

  const applyStats = useCallback((data: HomeActivityData) => {
    if (data.windowKey && windowKeyRef.current && data.windowKey !== windowKeyRef.current) {
      setMenuOpen(false);
    }
    if (data.windowKey) {
      windowKeyRef.current = data.windowKey;
    }
    setStats(data);
  }, []);

  const load = useCallback(
    async (force = false) => {
      const data = await fetchHomeActivity(force ? { force: true } : undefined);
      if (data) applyStats(data);
    },
    [applyStats]
  );

  const locale = useMemo(() => (language === 'ru' ? 'ru-RU' : 'uk-UA'), [language]);
  const fmt = useCallback((n: number) => n.toLocaleString(locale), [locale]);

  useLayoutEffect(() => {
    const key = getHomeActivityWindowKey();
    if (stats?.windowKey && stats.windowKey !== key) {
      windowKeyRef.current = key;
      setMenuOpen(false);
      setStats({
        online: stats.online,
        newListingsToday: 0,
        newListingsByCity: [],
        newListingsByCategory: [],
        windowKey: key,
      });
      void load(true);
    }
  }, [load, stats?.online, stats?.windowKey]);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => void load(false), HOME_ACTIVITY_CLIENT_TTL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load(false);
      }
    };
    const onFocus = () => void load(false);
    const onHomeRefresh = () => void load(true);
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
    return onHomeActivityDayRollover(() => {
      const windowKey = getHomeActivityWindowKey();
      windowKeyRef.current = windowKey;
      setMenuOpen(false);
      setStats((prev) => ({
        online: prev?.online ?? 0,
        newListingsToday: 0,
        newListingsByCity: [],
        newListingsByCategory: [],
        windowKey,
      }));
      void load(true);
    });
  }, [load]);

  const updateMenuPosition = useCallback(() => {
    const el = listingsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (listingsRef.current?.contains(target)) return;
      const portal = document.getElementById('home-activity-city-menu');
      if (portal?.contains(target)) return;
      setMenuOpen(false);
    };
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const online = useMemo(() => stats?.online ?? null, [stats?.online]);
  const listings = useMemo(() => stats?.newListingsToday ?? null, [stats?.newListingsToday]);
  const cities = useMemo(() => stats?.newListingsByCity ?? [], [stats?.newListingsByCity]);

  const pillOnline = useMemo(
    () =>
      isLight
        ? 'flex shrink-0 max-w-[min(11.5rem,calc(50%-6px))] items-center gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-2.5 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3 sm:py-2'
        : 'flex shrink-0 max-w-[min(11.5rem,calc(50%-6px))] items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-2.5 py-2 text-xs text-white shadow-sm sm:text-sm sm:px-3 sm:py-2',
    [isLight]
  );

  const pillListingsBase = isLight
    ? 'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200/90 bg-white/90 px-3 py-2 text-xs shadow-sm ring-1 ring-black/[0.03] sm:text-sm sm:px-3.5'
    : 'flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-transparent px-1 py-2 text-xs text-white sm:text-sm sm:px-2';

  const pillListingsIdle = pillListingsBase;

  const pillListingsActive = isLight
    ? `${pillListingsBase} border-[#3F5331]/40 ring-[#3F5331]/15`
    : 'flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/[0.08] px-2 py-2 text-xs text-white sm:text-sm';

  const iconClass = isLight ? 'shrink-0 text-[#3F5331]' : 'shrink-0 text-white/90';
  const numClass = isLight
    ? `font-semibold tabular-nums ${ac.pageHeading}`
    : 'font-semibold tabular-nums text-white';
  const mutedClass = isLight ? ac.mutedText : 'text-white/75';

  const dropdownPanelClass = isLight
    ? 'max-h-56 overflow-y-auto rounded-xl border border-gray-200/90 bg-white py-1.5 shadow-lg ring-1 ring-black/[0.04]'
    : 'max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] py-2 shadow-lg';

  const dropdownHeaderClass = isLight
    ? `px-3 pb-1.5 pt-0.5 text-[11px] font-medium uppercase tracking-wide ${ac.mutedText}`
    : 'px-3 pb-1.5 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/50';

  const dropdownRowClass = isLight ? 'text-gray-900' : 'text-white';
  const dropdownDivider = isLight ? 'divide-black/[0.04]' : 'divide-white/[0.08]';

  const cityMenu =
    menuOpen && stats && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            id="home-activity-city-menu"
            role="listbox"
            aria-label={t('bazaar.activityListingsByCity')}
            className={dropdownPanelClass}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 200,
            }}
          >
            <div className={dropdownHeaderClass}>{t('bazaar.activityListingsByCity')}</div>
            {cities.length === 0 ? (
              <p className={`px-3 py-2.5 text-sm leading-snug ${isLight ? ac.mutedText : 'text-white/70'}`}>
                {t('bazaar.activityListingsByCityEmpty')}
              </p>
            ) : (
              <ul className={`divide-y ${dropdownDivider}`}>
                {cities.map(({ city, count }) => {
                  const label = city ? city : t('bazaar.activityOtherCity');
                  return (
                    <li
                      key={city || '__other__'}
                      className={`px-3 py-2.5 text-sm leading-snug ${dropdownRowClass}`}
                      role="option"
                    >
                      <span className="block min-w-0">
                        {t('bazaar.activityCityRow', {
                          city: label,
                          count: fmt(count),
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative z-20 flex w-full flex-wrap gap-2 sm:gap-2.5">
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
            <span className={`break-words font-normal ${mutedClass}`}>{t('bazaar.activityListingsTail')}</span>
          </span>
          {stats && (
            <ChevronDown
              size={16}
              strokeWidth={2.25}
              className={`shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''} ${isLight ? ac.mutedText : 'text-white/60'}`}
              aria-hidden
            />
          )}
        </button>
      </div>

      {cityMenu}
    </div>
  );
});
