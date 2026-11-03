'use client';

import { useEffect, useRef } from 'react';
import type { Listing } from '@/types';
import {
  type NavTab,
  consumeTabReturnListing,
  peekTabReturnListing,
  readTabScroll,
  restoreWindowScroll,
} from '@/lib/navigation/tabNavRestore';

type Options = {
  tab: NavTab;
  /** Не чіпати, поки відкрита картка/профіль (крім першого reopen). */
  overlayOpen: boolean;
  setSelectedListing: (listing: Listing | null) => void;
  /** Стрічка готова для відновлення скролу. */
  ready?: boolean;
};

/**
 * Після повернення на вкладку з меню:
 * 1) знову відкриває картку товару, якщо пішли з відкритої
 * 2) відновлює скрол стрічки
 */
export function useTabReturnRestore({
  tab,
  overlayOpen,
  setSelectedListing,
  ready = true,
}: Options): void {
  const didReopenRef = useRef(false);
  const didScrollRef = useRef(false);
  const reopenInFlightRef = useRef(false);

  // Картка — одразу, без очікування стрічки
  useEffect(() => {
    if (didReopenRef.current || reopenInFlightRef.current) return;
    if (typeof window === 'undefined') return;
    if (overlayOpen) {
      didReopenRef.current = true;
      return;
    }

    const returnListingId = peekTabReturnListing(tab);
    if (returnListingId == null) {
      didReopenRef.current = true;
      return;
    }

    reopenInFlightRef.current = true;
    let cancelled = false;

    const viewerId =
      sessionStorage.getItem('telegramId') ||
      new URLSearchParams(window.location.search).get('telegramId') ||
      '';
    const qs = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : '';

    fetch(`/api/listings/${returnListingId}${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        consumeTabReturnListing(tab);
        if (data?.id) {
          setSelectedListing(data as Listing);
        }
        didReopenRef.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          consumeTabReturnListing(tab);
          didReopenRef.current = true;
        }
      })
      .finally(() => {
        reopenInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [tab, overlayOpen, setSelectedListing]);

  // Скрол стрічки — коли є контент і немає оверлею
  useEffect(() => {
    if (didScrollRef.current) return;
    if (!ready) return;
    if (overlayOpen) return;
    if (typeof window === 'undefined') return;

    const savedScroll = readTabScroll(tab);
    didScrollRef.current = true;
    if (savedScroll <= 0) return;

    const delays = [50, 150, 350, 600, 1000];
    const timers = delays.map((ms) =>
      window.setTimeout(() => restoreWindowScroll(savedScroll), ms)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [tab, overlayOpen, ready]);
}
