'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Стара сторінка /referral → рефералка в профілі маркетплейсу. */
export default function ReferralPage() {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('openReferralModal', '1');
    router.replace(`/${lang}/profile`);
  }, [lang, router]);

  return null;
}
