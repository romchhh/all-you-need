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
  /** Додатковий сигнал готовності стрічки (напр. listings.length > 0). */
  ready?: boolean;
};

/**
 * Після повернення на вкладку з меню:
 * 1) відновлює скрол
 * 2) знову відкриває картку товару, якщо пішли з відкритої
 */
export function useTabReturnRestore({
  tab,
  overlayOpen,
  setSelectedListing,
  ready = true,
}: Options): void {
  const didRestoreRef = useRef(false);
  const reopenInFlightRef = useRef(false);

  useEffect(() => {
    if (didRestoreRef.current) return;
    if (!ready) return;
    if (typeof window === 'undefined') return;

    const returnListingId = peekTabReturnListing(tab);
    const savedScroll = readTabScroll(tab);

    // Спочатку скрол каталогу (під карткою)
    if (!overlayOpen && savedScroll > 0) {
      const delays = [50, 150, 350, 600];
      delays.forEach((ms) => {
        setTimeout(() => restoreWindowScroll(savedScroll), ms);
      });
    }

    if (returnListingId == null || overlayOpen || reopenInFlightRef.current) {
      didRestoreRef.current = true;
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
        if (cancelled || !data?.id) return;
        consumeTabReturnListing(tab);
        setSelectedListing(data as Listing);
        didRestoreRef.current = true;
      })
      .catch(() => {
        consumeTabReturnListing(tab);
        didRestoreRef.current = true;
      })
      .finally(() => {
        reopenInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [tab, overlayOpen, ready, setSelectedListing]);
}
