'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { TradeGroundLogo } from '@/components/TradeGroundLogo';

export const AppHeader: React.FC = () => {
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';

  const handleClick = () => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${lang}/bazaar`;
    }
  };

  return (
    <TradeGroundLogo onClick={handleClick} className="pt-[1mm]" />
  );
};
