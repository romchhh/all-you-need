'use client';

import { PauseCircle, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

interface BusinessSuspendedCardProps {
  onRenew: () => void;
}

export function BusinessSuspendedCard({ onRenew }: BusinessSuspendedCardProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  return (
    <button
      type="button"
      onClick={onRenew}
      className={`mb-2 w-full touch-manipulation rounded-xl border text-left transition-colors active:scale-[0.99] ${
        isLight
          ? 'border-amber-300/60 bg-amber-50/80'
          : 'border-amber-400/25 bg-amber-500/10'
      }`}
    >
      <div className="flex items-center gap-2.5 p-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          <PauseCircle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${ac.pageHeading}`}>
            {t('businessProfile.suspended.title')}
          </p>
          <p className={`truncate text-xs ${ac.mutedText}`}>{t('businessProfile.suspended.descriptionShort')}</p>
        </div>
        <ChevronRight size={16} className={`shrink-0 ${ac.mutedText}`} />
      </div>
    </button>
  );
}
