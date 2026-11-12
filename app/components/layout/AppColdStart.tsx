'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePageTransition } from '@/contexts/PageTransitionContext';
import { useUser } from '@/features/user/hooks/useUser';

function isLangRoot(pathname: string | null): boolean {
  if (!pathname) return true;
  return /^\/(uk|ru)\/?$/.test(pathname);
}

/**
 * Холодний старт Mini App: HTML-splash → React page-loader → hide коли є реальний маршрут.
 */
export function AppColdStart() {
  const pathname = usePathname();
  const { hide } = usePageTransition();
  const { loading: userLoading } = useUser();
  const htmlSplashClearedRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (htmlSplashClearedRef.current) return;
    htmlSplashClearedRef.current = true;
    const el = document.getElementById('app-boot-splash');
    if (!el) return;
    el.classList.add('is-done');
    const t = window.setTimeout(() => {
      el.remove();
    }, 220);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (dismissedRef.current) return;
    if (typeof pathname === 'string' && pathname.startsWith('/admin')) {
      dismissedRef.current = true;
      void hide({ minMs: 0 });
      return;
    }
    if (isLangRoot(pathname)) return;
    if (userLoading) return;

    dismissedRef.current = true;
    void hide({ minMs: 420 });
  }, [pathname, userLoading, hide]);

  // Safety: не тримати лоадер вічно, якщо user/route зависли
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      void hide({ minMs: 0 });
    }, 8000);
    return () => window.clearTimeout(t);
  }, [hide]);

  return null;
}
