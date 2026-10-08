'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

export type SearchEntityMode = 'listings' | 'businesses';

type SearchEntityToggleProps = {
  mode: SearchEntityMode;
  onChange: (mode: SearchEntityMode) => void;
  count?: number | null;
  className?: string;
};

export function SearchEntityToggle({ mode, onChange, count, className = '' }: SearchEntityToggleProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const showCount = typeof count === 'number';

  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <div className={`flex min-w-0 flex-1 ${showCount ? 'gap-6 sm:gap-8' : 'gap-0'}`}>
        {(['listings', 'businesses'] as const).map((item) => {
          const active = mode === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                if (active) return;
                onChange(item);
              }}
              className={`relative pb-2.5 text-base font-semibold transition-colors sm:text-[1.0625rem] ${
                showCount ? 'shrink-0' : 'flex-1 text-center'
              } ${
                active
                  ? isLight
                    ? 'text-[#3F5331] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-[#3F5331]'
                    : 'text-[#C8E6A0] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-[#C8E6A0]'
                  : isLight
                    ? 'text-[#5A6B52] hover:text-[#3F5331]'
                    : 'text-white/60 hover:text-[#C8E6A0]'
              }`}
            >
              {item === 'listings'
                ? t('bazaar.search.modeListings')
                : t('bazaar.search.modeBusinesses')}
            </button>
          );
        })}
      </div>
      {showCount && (
        <span
          className={`shrink-0 pb-2.5 text-base font-medium ${
            isLight ? 'text-[#5A6B52]' : 'text-white/55'
          }`}
        >
          {count}
        </span>
      )}
    </div>
  );
}
