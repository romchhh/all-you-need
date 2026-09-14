'use client';

import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { BusinessBetaBadge } from '@/components/business/BusinessBetaBadge';
import { BusinessBrandIcon } from '@/components/business/BusinessBrandIcon';

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
        <BusinessBrandIcon
          size={26}
          className={`shrink-0 ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`}
        />
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
