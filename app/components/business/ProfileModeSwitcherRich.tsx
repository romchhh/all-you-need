'use client';

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
  /** Короткий статус (неактивний, draft, PRO призупинено) */
  businessStatusLabel?: string | null;
  className?: string;
};

export function ProfileModeSwitcherRich({
  mode,
  onChange,
  personalName,
  personalAvatar,
  businessName,
  businessLogo,
  businessStatusLabel,
  className = '',
}: ProfileModeSwitcherRichProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);

  const personalAvatarUrl = personalAvatar ? getResolvedImageUrl(personalAvatar) : null;
  const logoUrl = businessLogo ? getResolvedImageUrl(businessLogo) : null;
  const isBusiness = mode === 'business';

  return (
    <div
      role="tablist"
      aria-label={t('businessProfile.switcher.personal')}
      className={`relative grid grid-cols-2 gap-1 rounded-2xl p-1.5 ${
        isLight ? 'bg-gray-100/90' : 'border border-white/10 bg-black/30'
      } ${className}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl ${ui.limeBg} shadow-sm transition-transform duration-300 ease-out ${
          isBusiness ? 'translate-x-[calc(100%+0.25rem)]' : 'translate-x-0'
        }`}
      />

      <button
        type="button"
        role="tab"
        aria-selected={!isBusiness}
        onClick={() => onChange('personal')}
        className={`relative z-10 flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
          !isBusiness
            ? 'text-[#1a1a1a]'
            : isLight
              ? 'text-gray-700 hover:bg-white/50'
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
        <span className="min-w-0 truncate text-xs font-semibold">
          {personalName}
          <span
            className={`block text-[10px] font-medium ${
              !isBusiness ? 'text-[#1a1a1a]/70' : ac.mutedText
            }`}
          >
            {t('businessProfile.switcher.personal')}
          </span>
        </span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={isBusiness}
        onClick={() => onChange('business')}
        className={`relative z-10 flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
          isBusiness
            ? 'text-[#1a1a1a]'
            : isLight
              ? 'text-gray-700 hover:bg-white/50'
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
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {businessName}
          {businessStatusLabel ? (
            <span
              className={`block truncate text-[10px] font-medium ${
                isBusiness ? 'text-[#1a1a1a]/70' : ac.mutedText
              }`}
            >
              {businessStatusLabel}
            </span>
          ) : (
            <span
              className={`block truncate text-[10px] font-medium ${
                isBusiness ? 'text-[#1a1a1a]/70' : ac.mutedText
              }`}
            >
              {t('businessProfile.switcher.business')}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
