'use client';

import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  coverIconPath,
  coverSchemeForListingId,
  resolveCoverIconCategoryId,
} from '@/lib/listings/autoCover';

export type ListingAutoCoverSize = 'sm' | 'md' | 'lg';

interface ListingAutoCoverProps {
  listingId: string | number;
  title: string;
  category?: string | null;
  subcategory?: string | null;
  size?: ListingAutoCoverSize;
  className?: string;
}

const SIZE_CFG: Record<
  ListingAutoCoverSize,
  { icon: number; titleClass: string; pad: string; gap: string; lines: number }
> = {
  sm: {
    icon: 22,
    titleClass: 'text-[10px] leading-tight font-semibold',
    pad: 'p-2',
    gap: 'gap-1.5',
    lines: 2,
  },
  md: {
    icon: 36,
    titleClass: 'text-sm leading-snug font-semibold',
    pad: 'p-3',
    gap: 'gap-2',
    lines: 3,
  },
  lg: {
    icon: 48,
    titleClass: 'text-base sm:text-lg leading-snug font-semibold',
    pad: 'p-4 sm:p-5',
    gap: 'gap-3',
    lines: 3,
  },
};

/** Текстова обкладинка: іконка категорії + title, колір стабільний від listing id. */
export function ListingAutoCover({
  listingId,
  title,
  category,
  subcategory,
  size = 'md',
  className = '',
}: ListingAutoCoverProps) {
  const { isLight } = useTheme();
  const cfg = SIZE_CFG[size];
  const scheme = useMemo(() => coverSchemeForListingId(listingId), [listingId]);
  const colors = isLight ? scheme.light : scheme.dark;
  const iconCategoryId = useMemo(
    () => resolveCoverIconCategoryId(category, subcategory),
    [category, subcategory]
  );
  const iconSrc = coverIconPath(iconCategoryId, isLight);
  const displayTitle = (title || '').trim() || '—';

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center text-center overflow-hidden select-none ${cfg.pad} ${cfg.gap} ${className}`}
      style={{
        background: `linear-gradient(165deg, ${colors.bgAccent} 0%, ${colors.bg} 55%, ${colors.bgAccent} 100%)`,
        color: colors.fg,
      }}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: `radial-gradient(circle at 18% 22%, ${colors.fg}22 0%, transparent 42%),
            radial-gradient(circle at 82% 78%, ${colors.fg}18 0%, transparent 46%)`,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt=""
        width={cfg.icon}
        height={cfg.icon}
        className="relative z-[1] shrink-0 object-contain opacity-90"
        draggable={false}
      />
      <p
        className={`relative z-[1] w-full max-w-full break-words ${cfg.titleClass}`}
        style={{
          color: colors.fg,
          display: '-webkit-box',
          WebkitLineClamp: cfg.lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {displayTitle}
      </p>
    </div>
  );
}
