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

  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 gap-8">
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
              className={`relative pb-2 text-sm font-semibold transition-colors ${
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
      {typeof count === 'number' && (
        <span
          className={`shrink-0 pb-2 text-sm font-medium ${
            isLight ? 'text-[#5A6B52]' : 'text-white/55'
          }`}
        >
          {count}
        </span>
      )}
    </div>
  );
}
