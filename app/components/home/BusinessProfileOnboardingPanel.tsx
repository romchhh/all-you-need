'use client';

import { MessageCircle, Phone, Star } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

const FEATURE_KEYS = [
  'showcase',
  'search',
  'info',
  'stats',
] as const;

type BusinessProfileOnboardingPanelProps = {
  onCreate: () => void;
};

export function BusinessProfileOnboardingPanel({ onCreate }: BusinessProfileOnboardingPanelProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const ctaClass = isLight
    ? 'w-full rounded-2xl bg-[#C8E6A0] px-4 py-3.5 text-sm font-semibold text-[#1a1a1a] transition-opacity hover:opacity-90 active:opacity-80'
    : 'w-full rounded-2xl bg-[#C8E6A0] px-4 py-3.5 text-sm font-semibold text-[#0f1408] transition-opacity hover:opacity-90 active:opacity-80';

  return (
    <div className="space-y-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className={`text-sm leading-relaxed ${ac.mutedText}`}>
        {t('platformTicker.onboarding.businessDetail.lead')}
      </p>

      <div
        className={`overflow-hidden rounded-2xl border ${
          isLight ? 'border-[#3F5331]/15 bg-white shadow-sm' : 'border-[#C8E6A0]/15 bg-[#141414]'
        }`}
        aria-hidden
      >
        <div
          className={`relative h-20 ${
            isLight
              ? 'bg-gradient-to-br from-[#3F5331]/35 to-[#2a3820]/25'
              : 'bg-gradient-to-br from-[#3F5331]/55 to-[#1a2414]'
          }`}
        />
        <div className="relative px-3 pb-3">
          <div
            className={`-mt-8 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full ring-2 ring-offset-2 ${
              isLight
                ? 'bg-[#111] text-lg font-bold text-[#C8E6A0] ring-white ring-offset-white'
                : 'bg-[#111] text-lg font-bold text-[#C8E6A0] ring-[#C8E6A0]/25 ring-offset-[#141414]'
            }`}
          >
            TG
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <p className={`text-sm font-bold ${ac.pageHeading}`}>
              {t('platformTicker.onboarding.businessDetail.mockupName')}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide ${
                isLight ? 'border border-[#3F5331]/45 text-[#3F5331]' : 'border border-[#C8E6A0]/45 text-[#C8E6A0]'
              }`}
            >
              BUSINESS
            </span>
          </div>
          <p className={`mt-0.5 text-xs ${ac.mutedText}`}>
            {t('platformTicker.onboarding.businessDetail.mockupSubtitle')}
          </p>
          <div className="mt-2 flex gap-1.5">
            {[
              { icon: MessageCircle, label: t('businessProfile.public.write') },
              { icon: Phone, label: t('businessProfile.public.call') },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[9px] font-medium ${
                  isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                }`}
              >
                <Icon size={14} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[1, 2].map((i) => (
              <div
                key={i}
                className={`overflow-hidden rounded-lg ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}
              >
                <div className={`aspect-[4/3] ${isLight ? 'bg-gray-200' : 'bg-white/15'}`} />
                <div className="p-1.5">
                  <div className={`mb-1 h-2 w-3/4 rounded ${isLight ? 'bg-gray-300' : 'bg-white/20'}`} />
                  <div className="flex items-center gap-0.5">
                    <Star size={8} className="fill-amber-400 text-amber-400" />
                    <span className={`text-[8px] ${ac.mutedText}`}>4.9</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="space-y-2.5">
        {FEATURE_KEYS.map((key) => (
          <li
            key={key}
            className={`rounded-xl px-3 py-2.5 ${isLight ? 'bg-gray-50/90' : 'bg-white/[0.04]'}`}
          >
            <p className={`text-sm font-semibold leading-snug ${ac.pageHeading}`}>
              {t(`platformTicker.onboarding.businessDetail.features.${key}.title`)}
            </p>
            <p className={`mt-0.5 text-xs leading-relaxed ${ac.mutedText}`}>
              {t(`platformTicker.onboarding.businessDetail.features.${key}.description`)}
            </p>
          </li>
        ))}
      </ul>

      <button type="button" onClick={onCreate} className={ctaClass}>
        {t('platformTicker.onboarding.businessDetail.cta')}
      </button>
    </div>
  );
}
