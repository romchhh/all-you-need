'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

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
    'flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors text-center';
  const active = isLight
    ? 'bg-[#3F5331] text-white shadow-sm'
    : 'bg-[#C8E6A0] text-[#1a1a1a]';
  const idle = isLight
    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    : 'bg-white/10 text-white/80 hover:bg-white/15';

  return (
    <div
      className={`flex gap-2 p-1 rounded-2xl mb-4 ${
        isLight ? 'bg-gray-100/80' : 'bg-black/30 border border-white/10'
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
        {t('businessProfile.switcher.business')}
      </button>
    </div>
  );
}
