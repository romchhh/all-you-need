'use client';

import React, { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FixedLogoHeader } from '@/components/FixedLogoHeader';

export const AppHeader: React.FC = () => {
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';

  const handleClick = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${lang}/bazaar`;
    }
  }, [lang]);

  return <FixedLogoHeader mode="window-fixed" onClick={handleClick} />;
};
