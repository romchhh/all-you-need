'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { PROMOTION_OPTIONS } from '@/constants/promotions';

type PromotionTypeCardsProps = {
  isLight: boolean;
  compact?: boolean;
};

function PromotionIcon({ type, isLight }: { type: string; isLight: boolean }) {
  const iconClass = `h-5 w-5 ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`;

  if (type === 'highlighted') {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
        />
      </svg>
    );
  }

  if (type === 'top_category') {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    );
  }

  return (
    <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  );
}

export function PromotionTypeCards({ isLight, compact = false }: PromotionTypeCardsProps) {
  const { t } = useLanguage();

  const titleClass = isLight ? 'text-gray-900' : 'text-white';
  const mutedClass = isLight ? 'text-gray-600' : 'text-white/70';
  const accentText = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';
  const cardClass = isLight
    ? 'rounded-xl border border-gray-200/90 bg-white p-3.5'
    : 'rounded-xl border border-white/20 bg-[#1C1C1C] p-3.5';
  const iconShellClass = isLight
    ? 'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white'
    : 'flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-[#1C1C1C]';
  const featuresClass = isLight
    ? 'rounded-lg border border-gray-200/90 bg-gray-50/90 p-2.5'
    : 'rounded-lg border border-white/20 bg-black p-2.5';

  return (
    <div className={`space-y-2.5 ${compact ? '' : 'space-y-3'}`}>
      {PROMOTION_OPTIONS.map((promo) => (
        <div key={promo.type} className={cardClass}>
          <div className="flex items-start gap-2.5">
            <div className={iconShellClass}>
              <PromotionIcon type={promo.type} isLight={isLight} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <h3 className={`text-sm font-bold ${titleClass}`}>{t(`promotions.${promo.type}`)}</h3>
                {promo.badge && (
                  <span
                    className={
                      isLight
                        ? 'rounded-full border border-[#3F5331]/25 bg-[#3F5331]/12 px-2 py-0.5 text-[10px] font-medium text-[#3F5331]'
                        : 'rounded-full border border-[#C8E6A0]/35 bg-[#C8E6A0]/12 px-2 py-0.5 text-[10px] font-medium text-[#C8E6A0]'
                    }
                  >
                    {t(`promotions.${promo.badge}`)}
                  </span>
                )}
              </div>

              <p className={`text-xs ${mutedClass}`}>{t(`promotions.${promo.type}Desc`)}</p>

              <div className={`mt-2 ${featuresClass}`}>
                <p className={`whitespace-pre-line text-[11px] leading-relaxed ${mutedClass}`}>
                  {t(`promotions.${promo.type}Features`)}
                </p>
              </div>

              <div className="mt-2">
                <p className={`text-lg font-bold leading-none ${accentText}`}>
                  {promo.price.toFixed(1)}€
                </p>
                <p className={`mt-0.5 text-[11px] ${mutedClass}`}>{t('promotions.duration')}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
