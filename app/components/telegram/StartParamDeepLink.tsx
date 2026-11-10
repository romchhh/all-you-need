'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  OPEN_BUSINESS_FLOW_KEY,
  OPEN_CREATE_LISTING_KEY,
  START_PARAM_APPLIED_KEY,
  parseStartParam,
  readTelegramStartParam,
} from '@/utils/telegramStartParam';

function langFromPath(pathname: string | null): 'uk' | 'ru' {
  return pathname?.startsWith('/ru') ? 'ru' : 'uk';
}

/**
 * Ловить t.me/Bot?startapp=business|create|listing_N на будь-якій сторінці
 * (WebApp часто відкриває одразу /bazaar, минаючи /[lang]/page).
 */
export function StartParamDeepLink() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pathname?.startsWith('/admin')) return;

    let cancelled = false;

    const apply = (raw: string): boolean => {
      const action = parseStartParam(raw);
      if (!action || action.type === 'unknown') return false;

      const already = sessionStorage.getItem(START_PARAM_APPLIED_KEY);
      if (already === raw) {
        // Прапорці могли лишитись після редіректу — не ігноруємо business/create flags
        if (action.type === 'business' && sessionStorage.getItem(OPEN_BUSINESS_FLOW_KEY) === '1') {
          const lang = langFromPath(pathname);
          if (!pathname?.includes('/profile')) {
            router.replace(`/${lang}/profile`);
          }
          return true;
        }
        return true;
      }

      sessionStorage.setItem(START_PARAM_APPLIED_KEY, raw);
      const lang = langFromPath(pathname);

      if (action.type === 'listing') {
        router.replace(`/${lang}/listing/${action.id}`);
        return true;
      }
      if (action.type === 'business') {
        sessionStorage.setItem(OPEN_BUSINESS_FLOW_KEY, '1');
        router.replace(`/${lang}/profile`);
        return true;
      }
      if (action.type === 'create') {
        sessionStorage.setItem(OPEN_CREATE_LISTING_KEY, '1');
        if (!pathname?.includes('/bazaar')) {
          router.replace(`/${lang}/bazaar`);
        }
        return true;
      }
      return false;
    };

    const tryOnce = (): boolean => {
      try {
        window.Telegram?.WebApp?.ready?.();
      } catch {
        /* ignore */
      }
      const sp = readTelegramStartParam();
      if (!sp) return false;
      return apply(sp);
    };

    if (tryOnce()) return;

    // Telegram script / initData можуть з’явитись із затримкою
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (cancelled) return;
      attempts += 1;
      if (tryOnce() || attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}
