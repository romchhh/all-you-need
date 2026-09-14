'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

export function BusinessBetaBadge({ className = '' }: { className?: string }) {
  const { t } = useLanguage();
  const { isLight } = useTheme();

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        isLight
          ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/80'
          : 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30'
      } ${className}`}
    >
      {t('businessProfile.beta')}
    </span>
  );
}
