'use client';

import { useEffect, useRef } from 'react';
import { usePageTransition } from '@/contexts/PageTransitionContext';

const DEFAULT_MIN_MS = 360;

/**
 * Показує глобальний лоадер при вході на маршрут; ховає, коли `ready === true`.
 */
export function useRoutePageLoader(ready: boolean, options?: { minMs?: number; enabled?: boolean }) {
  const { show, hide } = usePageTransition();
  const minMs = options?.minMs ?? DEFAULT_MIN_MS;
  const enabled = options?.enabled !== false;
  const shownRef = useRef(false);
  const readyFiredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    shownRef.current = true;
    show({ minMs });
  }, [enabled, show, minMs]);

  useEffect(() => {
    if (!enabled || !ready || readyFiredRef.current) return;
    readyFiredRef.current = true;
    void hide({ minMs });
  }, [ready, enabled, hide, minMs]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      if (shownRef.current && !readyFiredRef.current) {
        void hide({ minMs: 0 });
      }
    };
  }, [enabled, hide]);
}
