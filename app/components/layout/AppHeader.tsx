'use client';

import React, { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FixedLogoHeader } from '@/components/layout/FixedLogoHeader';
import { dispatchBazaarRestoreListingScroll } from '@/lib/bazaar/bazaarScrollStorage';

export const AppHeader: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';

  const handleClick = useCallback(() => {
    router.push(`/${lang}/bazaar`);
    dispatchBazaarRestoreListingScroll();
  }, [lang, router]);

  return <FixedLogoHeader mode="window-fixed" onClick={handleClick} />;
};
