'use client';

import { useEffect } from 'react';

export function ListingMediaCacheScript() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw-listing-media.js', { scope: '/' }).catch(() => {
        /* SW необов'язковий — HTTP-кеш лишається */
      });
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(register, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = setTimeout(register, 2000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
