'use client';

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCategories } from '@/constants/categories';
import { PlatformTickerInfoModal } from '@/components/home/PlatformTickerInfoModal';
import {
  buildTickerMessages,
  createEmptyTickerPools,
  createEmptyTickerTypeCounts,
  groupTickerMessages,
  pickNextTickerMessage,
  randomTickerIntervalMs,
  WELCOME_TICKER_EMOJI,
  TICKER_INFO_MENU_ENABLED,
  type TickerMessage,
} from '@/utils/platformTickerMessages';
import { fetchHomeActivity, onHomeActivityDayRollover, readHomeActivityCache } from '@/utils/homeActivityClient';

type HomePlatformTickerProps = {
  isLight: boolean;
};

const WELCOME_ID = 'platformTicker:welcome';

export const HomePlatformTicker = memo(function HomePlatformTicker({ isLight }: HomePlatformTickerProps) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState<TickerMessage | null>(null);
  const [animClass, setAnimClass] = useState<'animate-ticker-in' | 'animate-ticker-out'>('animate-ticker-in');
  const [infoOpen, setInfoOpen] = useState(false);

  const welcomeMessage = useMemo<TickerMessage>(
    () => ({
      id: WELCOME_ID,
      text: t('platformTicker.welcome'),
      emoji: WELCOME_TICKER_EMOJI,
      type: 'platform',
    }),
    [t]
  );

  const poolsRef = useRef(createEmptyTickerPools());
  const shownRef = useRef<Set<string>>(new Set());
  const typeCountsRef = useRef(createEmptyTickerTypeCounts());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const pickAndShow = useCallback((initial = false) => {
    let next = pickNextTickerMessage(poolsRef.current, shownRef.current, typeCountsRef.current);

    if (!next) {
      shownRef.current.clear();
      typeCountsRef.current = createEmptyTickerTypeCounts();
      next = pickNextTickerMessage(poolsRef.current, shownRef.current, typeCountsRef.current);
    }

    if (!next) return;

    shownRef.current.add(next.id);
    typeCountsRef.current[next.type] += 1;

    if (initial) {
      setCurrent(next);
      setAnimClass('animate-ticker-in');
      return;
    }

    setAnimClass('animate-ticker-out');
    if (transitionRef.current) clearTimeout(transitionRef.current);
    transitionRef.current = setTimeout(() => {
      setCurrent(next);
      setAnimClass('animate-ticker-in');
    }, 420);
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pickAndShow(false);
      scheduleNext();
    }, randomTickerIntervalMs());
  }, [pickAndShow]);

  const applyTickerPools = useCallback(
    (initial: boolean, started: { value: boolean }, activity?: {
      newListingsToday: number;
      newListingsByCity: Array<{ city: string; count: number }>;
      newListingsByCategory: Array<{ category: string; count: number }>;
    }) => {
      const categories = getCategories(t);
      const messages = buildTickerMessages(t, categories, {
        newListingsToday: activity?.newListingsToday ?? 0,
        newListingsByCity: activity?.newListingsByCity ?? [],
        newListingsByCategory: activity?.newListingsByCategory ?? [],
      });
      poolsRef.current = groupTickerMessages(messages);
      shownRef.current.clear();
      typeCountsRef.current = createEmptyTickerTypeCounts();

      if (initial && !started.value) {
        started.value = true;
        pickAndShow(true);
        scheduleNext();
      }
    },
    [pickAndShow, scheduleNext, t]
  );

  const reloadActivityPools = useCallback(
    async (initial: boolean, started: { value: boolean }, force = false) => {
      try {
        const data = await fetchHomeActivity(force ? { force: true } : undefined);
        if (!data) {
          if (initial) applyTickerPools(true, started);
          return;
        }

        applyTickerPools(initial, started, {
          newListingsToday: data.newListingsToday ?? 0,
          newListingsByCity: Array.isArray(data.newListingsByCity) ? data.newListingsByCity : [],
          newListingsByCategory: Array.isArray(data.newListingsByCategory)
            ? data.newListingsByCategory
            : [],
        });
      } catch {
        if (initial) applyTickerPools(true, started);
      }
    },
    [applyTickerPools]
  );

  useEffect(() => {
    let cancelled = false;
    const started = { value: false };

    const cached = readHomeActivityCache();
    if (cached) {
      applyTickerPools(true, started, {
        newListingsToday: cached.newListingsToday ?? 0,
        newListingsByCity: cached.newListingsByCity ?? [],
        newListingsByCategory: cached.newListingsByCategory ?? [],
      });
    }

    const load = async (initial: boolean) => {
      if (cancelled) return;
      await reloadActivityPools(initial, started);
    };

    void load(!cached);

    const refreshId = setInterval(() => void load(false), 10 * 60_000);
    const unsubscribeRollover = onHomeActivityDayRollover(() => {
      if (cancelled) return;
      void reloadActivityPools(false, started, true);
    });

    return () => {
      cancelled = true;
      clearInterval(refreshId);
      unsubscribeRollover();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionRef.current) clearTimeout(transitionRef.current);
    };
  }, [reloadActivityPools]);

  const displayMessage = current ?? welcomeMessage;

  const barClass = isLight
    ? 'flex w-full items-center gap-2.5 rounded-xl border border-[#3F5331]/25 bg-[#C8E6A0]/75 px-3 py-2 text-xs shadow-sm ring-1 ring-[#3F5331]/10 sm:text-sm'
    : 'flex w-full items-center gap-2.5 rounded-xl bg-[#C8E6A0]/95 px-3 py-2 text-xs sm:text-sm';

  const textClass = isLight ? 'text-[#1e2e18] font-medium' : 'text-[#0f1408] font-medium';
  const infoButtonClass = isLight
    ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#3F5331]/25 bg-white/70 text-[#3F5331] transition-colors hover:bg-white'
    : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#0f1408]/15 bg-[#0f1408]/5 text-[#0f1408] transition-colors hover:bg-[#0f1408]/10';

  return (
    <>
      <div ref={barRef} className={barClass} role="status" aria-live="polite">
        <span className="shrink-0 text-lg leading-none" aria-hidden>
          {displayMessage.emoji}
        </span>
        <p
          key={displayMessage.id}
          className={`min-w-0 flex-1 truncate leading-snug ${animClass} ${textClass}`}
        >
          {displayMessage.text}
        </p>
        <button
          type="button"
          onClick={() => setInfoOpen((open) => !open)}
          className={`${infoButtonClass}${infoOpen ? (isLight ? ' bg-white ring-1 ring-[#3F5331]/30' : ' bg-[#0f1408]/15') : ''}`}
          aria-label={t('platformTicker.info.ariaLabel')}
          aria-expanded={infoOpen}
          disabled={!TICKER_INFO_MENU_ENABLED}
          style={TICKER_INFO_MENU_ENABLED ? undefined : { display: 'none' }}
        >
          <Info size={15} strokeWidth={2.25} />
        </button>
      </div>

      {TICKER_INFO_MENU_ENABLED && (
        <PlatformTickerInfoModal
          isOpen={infoOpen}
          onClose={() => setInfoOpen(false)}
          anchorRef={barRef}
          highlightType={displayMessage.type}
        />
      )}
    </>
  );
});
