'use client';

import { useTheme } from '@/contexts/ThemeContext';

export const ListingCardSkeleton = ({ index = 0 }: { index?: number }) => {
  const { isLight } = useTheme();
  const block = isLight ? 'bg-gray-200/80' : 'bg-white/10';
  const card = isLight ? 'bg-white shadow-sm ring-1 ring-black/[0.04]' : 'bg-[#1C1C1C] ring-1 ring-white/10';

  return (
    <div
      className={`overflow-hidden rounded-2xl animate-pulse ${card}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={`aspect-square ${block}`} />
      <div className="space-y-2 p-3">
        <div className={`h-5 w-24 rounded ${block}`} />
        <div className={`h-4 w-full rounded ${block}`} />
        <div className={`h-4 w-3/4 rounded ${block}`} />
        <div className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full ${block}`} />
          <div className={`h-3 w-20 rounded ${block}`} />
        </div>
      </div>
    </div>
  );
};

export const ListingGridSkeleton = ({
  count = 6,
  showLoadingText = false,
  loadingText,
  compact = false,
}: {
  count?: number;
  showLoadingText?: boolean;
  loadingText?: string;
  compact?: boolean;
}) => {
  const { isLight } = useTheme();

  return (
    <div className={compact ? '' : 'w-full'}>
      {showLoadingText && loadingText && (
        <div className="flex animate-content-in items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <div
              className={`h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${
                isLight ? 'border-[#3F5331]/30 border-t-[#3F5331]' : 'border-white/20 border-t-[#C8E6A0]'
              }`}
            />
            <p className={`text-sm ${isLight ? 'text-gray-600' : 'text-white/70'}`}>{loadingText}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [grid-auto-rows:1fr]">
        {Array.from({ length: count }).map((_, i) => (
          <ListingCardSkeleton key={i} index={i} />
        ))}
      </div>
    </div>
  );
};
