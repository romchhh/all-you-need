'use client';

import { useEffect } from 'react';
import { initMobileOptimizations } from '@/utils/mobileOptimization';

export function MobileOptimizationScript() {
  useEffect(() => {
    initMobileOptimizations();
  }, []);

  return null;
}
