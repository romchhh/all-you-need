'use client';

import { Briefcase, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

interface BusinessPromoCardProps {
  onCreate: () => void;
  variant?: 'create' | 'continue';
}

export function BusinessPromoCard({ onCreate, variant = 'create' }: BusinessPromoCardProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  return (
    <button
      type="button"
      onClick={onCreate}
      className={`w-full text-left rounded-2xl overflow-hidden border transition-transform active:scale-[0.99] ${
        isLight
          ? 'border-[#3F5331]/25 bg-gradient-to-br from-[#3F5331]/8 to-white shadow-sm'
          : 'border-[#C8E6A0]/20 bg-gradient-to-br from-[#3F5331]/40 to-[#1C1C1C]'
      }`}
    >
      <div className="p-4 flex gap-3">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
            isLight ? 'bg-[#3F5331]/15 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
          }`}
        >
          <Briefcase size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-base mb-1 ${ac.pageHeading}`}>
            {variant === 'continue'
              ? t('businessProfile.draft.title')
              : t('businessProfile.promo.title')}
          </p>
          <p className={`text-sm leading-snug mb-3 ${ac.mutedText}`}>
            {variant === 'continue'
              ? t('businessProfile.draft.description')
              : t('businessProfile.promo.description')}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-sm font-semibold ${
              isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'
            }`}
          >
            {variant === 'continue'
              ? t('businessProfile.draft.cta')
              : t('businessProfile.promo.cta')}
            <ChevronRight size={16} />
          </span>
        </div>
      </div>
    </button>
  );
}
