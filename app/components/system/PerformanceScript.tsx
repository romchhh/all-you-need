'use client';

import { useEffect } from 'react';
import { measureWebVitals } from '@/utils/performance';

export function PerformanceScript() {
  useEffect(() => {
    measureWebVitals();
  }, []);

  return null;
}
