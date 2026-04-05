'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const AYNMarketplace = () => {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';

  useEffect(() => {
    // Direct Link for Mini Apps: https://t.me/bot?startapp=listing_123
    const toBazaar = () => router.replace(`/${lang}/bazaar`);
    const tryListing = (): boolean => {
      if (typeof window === 'undefined') return false;
      const sp = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
      const m = typeof sp === 'string' ? sp.match(/^listing_(\d+)$/) : null;
      if (m) {
        router.replace(`/${lang}/listing/${m[1]}`);
        return true;
      }
      return false;
    };
    if (tryListing()) return;
    const tid = setTimeout(() => {
      if (!tryListing()) toBazaar();
    }, 400);
    return () => clearTimeout(tid);
  }, [lang, router]);

  return null;
};

export default AYNMarketplace;
