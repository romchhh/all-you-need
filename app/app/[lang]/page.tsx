'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  OPEN_BUSINESS_FLOW_KEY,
  OPEN_CREATE_LISTING_KEY,
  START_PARAM_APPLIED_KEY,
  parseStartParam,
  readTelegramStartParam,
} from '@/utils/telegramStartParam';

const AYNMarketplace = () => {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';

  useEffect(() => {
    // Fallback, якщо StartParamDeepLink ще не встиг: t.me/bot?startapp=…
    const toBazaar = () => router.replace(`/${lang}/bazaar`);

    const tryStart = (): boolean => {
      if (typeof window === 'undefined') return false;
      const sp = readTelegramStartParam();
      const action = parseStartParam(sp);
      if (!action || action.type === 'unknown') return false;

      sessionStorage.setItem(START_PARAM_APPLIED_KEY, sp || '');
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
        router.replace(`/${lang}/bazaar`);
        return true;
      }
      return false;
    };

    if (tryStart()) return;
    const tid = window.setTimeout(() => {
      if (!tryStart()) toBazaar();
    }, 500);
    return () => window.clearTimeout(tid);
  }, [lang, router]);

  return null;
};

export default AYNMarketplace;
