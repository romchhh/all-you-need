'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BusinessBetaBadge } from '@/components/business/BusinessBetaBadge';

export type ProfileViewMode = 'personal' | 'business';

interface ProfileModeSwitcherProps {
  mode: ProfileViewMode;
  onChange: (mode: ProfileViewMode) => void;
  hasBusinessProfile: boolean;
}

export function ProfileModeSwitcher({ mode, onChange, hasBusinessProfile }: ProfileModeSwitcherProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();

  if (!hasBusinessProfile) return null;

  const base =
    'flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-colors text-center touch-manipulation min-h-[2.5rem] flex items-center justify-center gap-1';
  const active = isLight
    ? 'bg-[#3F5331] text-white shadow-sm'
    : 'bg-[#C8E6A0] text-[#1a1a1a]';
  const idle = isLight
    ? 'bg-transparent text-gray-700 hover:bg-gray-200/80'
    : 'bg-transparent text-white/80 hover:bg-white/10';

  return (
    <div
      className={`mb-2 flex gap-1 rounded-xl p-1 ${
        isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'
      }`}
    >
      <button
        type="button"
        className={`${base} ${mode === 'personal' ? active : idle}`}
        onClick={() => onChange('personal')}
      >
        {t('businessProfile.switcher.personal')}
      </button>
      <button
        type="button"
        className={`${base} ${mode === 'business' ? active : idle}`}
        onClick={() => onChange('business')}
      >
        <span>{t('businessProfile.switcher.business')}</span>
        <BusinessBetaBadge />
      </button>
    </div>
  );
}
