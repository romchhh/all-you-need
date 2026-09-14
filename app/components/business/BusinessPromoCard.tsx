'use client';

import { Briefcase, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { BusinessBetaBadge } from '@/components/business/BusinessBetaBadge';

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
      className={`w-full text-left rounded-xl border transition-colors active:scale-[0.99] touch-manipulation ${
        isLight
          ? 'border-[#3F5331]/20 bg-[#3F5331]/5 hover:bg-[#3F5331]/8'
          : 'border-[#C8E6A0]/15 bg-white/[0.04] hover:bg-white/[0.07]'
      }`}
    >
      <div className="flex items-center gap-2.5 p-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isLight ? 'bg-[#3F5331]/12 text-[#3F5331]' : 'bg-[#C8E6A0]/12 text-[#C8E6A0]'
          }`}
        >
          <Briefcase size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <p className={`truncate text-sm font-semibold ${ac.pageHeading}`}>
              {variant === 'continue'
                ? t('businessProfile.draft.title')
                : t('businessProfile.promo.title')}
            </p>
            <BusinessBetaBadge />
          </div>
          <p className={`truncate text-xs ${ac.mutedText}`}>
            {variant === 'continue'
              ? t('businessProfile.draft.descriptionShort')
              : t('businessProfile.promo.descriptionShort')}
          </p>
        </div>
        <ChevronRight size={16} className={`shrink-0 ${ac.mutedText}`} />
      </div>
    </button>
  );
}
