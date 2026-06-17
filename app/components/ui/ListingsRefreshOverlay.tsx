'use client';

import { useTheme } from '@/contexts/ThemeContext';

export function ListingsRefreshOverlay() {
  const { isLight } = useTheme();

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-20 animate-content-in"
      aria-hidden
    >
      <div
        className={`flex items-center gap-2.5 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-md ${
          isLight
            ? 'border border-gray-200/80 bg-white/95'
            : 'border border-white/10 bg-black/75'
        }`}
      >
        <div
          className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${
            isLight ? 'border-[#3F5331]/25 border-t-[#3F5331]' : 'border-white/20 border-t-[#C8E6A0]'
          }`}
        />
      </div>
    </div>
  );
}
