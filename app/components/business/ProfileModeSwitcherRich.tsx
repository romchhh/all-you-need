'use client';

import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { getAvatarColor } from '@/utils/avatarColors';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import type { ProfileViewMode } from '@/components/business/ProfileModeSwitcher';

type ProfileModeSwitcherRichProps = {
  mode: ProfileViewMode;
  onChange: (mode: ProfileViewMode) => void;
  personalName: string;
  personalAvatar?: string | null;
  businessName: string;
  businessLogo?: string | null;
  className?: string;
};

export function ProfileModeSwitcherRich({
  mode,
  onChange,
  personalName,
  personalAvatar,
  businessName,
  businessLogo,
  className = '',
}: ProfileModeSwitcherRichProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);

  const personalAvatarUrl = personalAvatar ? getResolvedImageUrl(personalAvatar) : null;
  const logoUrl = businessLogo ? getResolvedImageUrl(businessLogo) : null;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl p-1.5 ${
        isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange('personal')}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
          mode === 'personal'
            ? `${ui.tabActive} shadow-sm`
            : isLight
              ? 'text-gray-700 hover:bg-white/70'
              : 'text-white/75 hover:bg-white/10'
        }`}
      >
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-200">
          {personalAvatarUrl ? (
            <img src={personalAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center text-xs font-bold text-white ${getAvatarColor(personalName)}`}
            >
              {personalName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <span className="truncate text-xs font-semibold">
          {personalName}
          <span
            className={`block text-[10px] font-medium ${
              mode === 'personal' ? 'text-[#1a1a1a]/70' : ac.mutedText
            }`}
          >
            {t('businessProfile.switcher.personal')}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChange('business')}
        className={`flex min-w-0 flex-[1.15] items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
          mode === 'business'
            ? `${ui.tabActive} shadow-sm`
            : isLight
              ? 'text-gray-700 hover:bg-white/70'
              : 'text-white/75 hover:bg-white/10'
        }`}
      >
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-[#111]">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#C8E6A0]">
              {businessName.charAt(0)}
            </div>
          )}
        </div>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{businessName}</span>
        <ChevronDown size={16} className="shrink-0 opacity-70" />
      </button>
    </div>
  );
}
