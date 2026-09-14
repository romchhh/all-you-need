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
      className={`w-full text-left rounded-2xl overflow-hidden border mb-3 transition-transform active:scale-[0.99] ${
        isLight
          ? 'border-amber-300/60 bg-gradient-to-br from-amber-50 to-white'
          : 'border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-[#1C1C1C]'
      }`}
    >
      <div className="p-4 flex gap-3">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
            isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          <PauseCircle size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-base mb-1 ${ac.pageHeading}`}>
            {t('businessProfile.suspended.title')}
          </p>
          <p className={`text-sm leading-snug mb-3 ${ac.mutedText}`}>
            {t('businessProfile.suspended.description')}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-sm font-semibold ${
              isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'
            }`}
          >
            {t('businessProfile.suspended.cta')}
            <ChevronRight size={16} />
          </span>
        </div>
      </div>
    </button>
  );
}
