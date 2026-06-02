'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCategories } from '@/constants/categories';
import {
  buildTickerMessages,
  groupTickerMessages,
  pickNextTickerMessage,
  randomTickerIntervalMs,
  WELCOME_TICKER_EMOJI,
  type TickerMessage,
  type TickerMessageType,
} from '@/utils/platformTickerMessages';
import { fetchHomeActivity } from '@/utils/homeActivityClient';

type HomePlatformTickerProps = {
  isLight: boolean;
};

const WELCOME_ID = 'platformTicker:welcome';

export function HomePlatformTicker({ isLight }: HomePlatformTickerProps) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState<TickerMessage | null>(null);
  const [animClass, setAnimClass] = useState<'animate-ticker-in' | 'animate-ticker-out'>('animate-ticker-in');

  const welcomeMessage = useMemo<TickerMessage>(
    () => ({
      id: WELCOME_ID,
      text: t('platformTicker.welcome'),
      emoji: WELCOME_TICKER_EMOJI,
      type: 'system',
    }),
    [t]
  );

  const poolsRef = useRef<Record<TickerMessageType, TickerMessage[]>>({
    system: [],
    activity: [],
    tips: [],
  });
  const shownRef = useRef<Set<string>>(new Set());
  const typeCountsRef = useRef<Record<TickerMessageType, number>>({
    system: 0,
    activity: 0,
    tips: 0,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickAndShow = useCallback((initial = false) => {
    let next = pickNextTickerMessage(poolsRef.current, shownRef.current, typeCountsRef.current);

    if (!next) {
      shownRef.current.clear();
      typeCountsRef.current = { system: 0, activity: 0, tips: 0 };
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
    (initial: boolean, started: { value: boolean }) => {
      const categories = getCategories(t);
      const messages = buildTickerMessages(t, categories, {
        newListingsToday: 0,
        newListingsByCity: [],
        newListingsByCategory: [],
      });
      poolsRef.current = groupTickerMessages(messages);

      if (initial && !started.value) {
        started.value = true;
        pickAndShow(true);
        scheduleNext();
      }
    },
    [pickAndShow, scheduleNext, t]
  );

  useEffect(() => {
    let cancelled = false;
    const started = { value: false };

    const load = async (initial: boolean) => {
      try {
        const data = await fetchHomeActivity();
        if (cancelled || !data) {
          if (initial && !started.value) applyTickerPools(true, started);
          return;
        }

        const categories = getCategories(t);
        const messages = buildTickerMessages(t, categories, {
          newListingsToday: data.newListingsToday ?? 0,
          newListingsByCity: Array.isArray(data.newListingsByCity) ? data.newListingsByCity : [],
          newListingsByCategory: Array.isArray(data.newListingsByCategory)
            ? data.newListingsByCategory
            : [],
        });

        poolsRef.current = groupTickerMessages(messages);

        if (initial && !started.value) {
          started.value = true;
          pickAndShow(true);
          scheduleNext();
        }
      } catch {
        if (!cancelled && initial) applyTickerPools(true, started);
      }
    };

    void load(true);

    const refreshId = setInterval(() => void load(false), 10 * 60_000);

    return () => {
      cancelled = true;
      clearInterval(refreshId);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionRef.current) clearTimeout(transitionRef.current);
    };
  }, [t, pickAndShow, scheduleNext, applyTickerPools]);

  const displayMessage = current ?? welcomeMessage;

  const barClass = isLight
    ? 'flex w-full items-center gap-2.5 rounded-xl border border-[#3F5331]/25 bg-[#C8E6A0]/75 px-3 py-2 text-xs shadow-sm ring-1 ring-[#3F5331]/10 sm:text-sm'
    : 'flex w-full items-center gap-2.5 rounded-xl bg-[#C8E6A0]/95 px-3 py-2 text-xs sm:text-sm';

  const textClass = isLight ? 'text-[#1e2e18] font-medium' : 'text-[#0f1408] font-medium';

  return (
    <div className={barClass} role="status" aria-live="polite">
      <span className="shrink-0 text-lg leading-none" aria-hidden>
        {displayMessage.emoji}
      </span>
      <p
        key={displayMessage.id}
        className={`min-w-0 flex-1 truncate leading-snug ${animClass} ${textClass}`}
      >
        {displayMessage.text}
      </p>
    </div>
  );
}
