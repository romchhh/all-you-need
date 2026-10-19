'use client';

import { memo, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Baby,
  Briefcase,
  Camera,
  Car,
  Eye,
  GraduationCap,
  Hand,
  HeartHandshake,
  HeartPulse,
  Home,
  Languages,
  Laptop,
  Paintbrush,
  PawPrint,
  Scissors,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Truck,
  Wrench,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  coverBackgroundStyle,
  coverIconPath,
  coverSchemeForListingId,
  resolveCoverIconCategoryId,
  resolveCoverLucideIcon,
  shortenCoverTitle,
  type CoverLucideIconName,
} from '@/lib/listings/autoCover';

export type ListingAutoCoverSize = 'sm' | 'md' | 'lg';

interface ListingAutoCoverProps {
  listingId: string | number;
  title: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  size?: ListingAutoCoverSize;
  className?: string;
  /** false — лише іконка (коли title вже в оверлеї, напр. «схожі»). */
  showTitle?: boolean;
}

const LUCIDE_MAP: Record<CoverLucideIconName, LucideIcon> = {
  Hand,
  Eye,
  Scissors,
  HeartPulse,
  Paintbrush,
  SprayCan,
  Languages,
  Laptop,
  Wrench,
  Truck,
  GraduationCap,
  HeartHandshake,
  Briefcase,
  Sparkles,
  Camera,
  Car,
  Home,
  Baby,
  Shirt,
  Sofa,
  Smartphone,
  PawPrint,
};

const SIZE_CFG: Record<
  ListingAutoCoverSize,
  { icon: number; titleClass: string; padX: string; padY: string; lines: number; maxTitle: number }
> = {
  sm: {
    icon: 28,
    titleClass: 'text-[11px] leading-snug font-semibold',
    padX: 'px-2.5',
    padY: 'py-3',
    lines: 2,
    maxTitle: 36,
  },
  md: {
    icon: 40,
    titleClass: 'text-sm leading-snug font-semibold',
    padX: 'px-3.5',
    padY: 'py-4',
    lines: 3,
    maxTitle: 48,
  },
  lg: {
    icon: 52,
    titleClass: 'text-[15px] sm:text-base leading-snug font-semibold',
    padX: 'px-4 sm:px-5',
    padY: 'py-5 sm:py-6',
    lines: 3,
    maxTitle: 56,
  },
};

/**
 * Вертикальна текстова обкладинка: іконка (за ключовими словами послуги) + короткий title.
 */
function ListingAutoCoverInner({
  listingId,
  title,
  description,
  category,
  subcategory,
  size = 'md',
  className = '',
  showTitle = true,
}: ListingAutoCoverProps) {
  const { isLight } = useTheme();
  const cfg = SIZE_CFG[size];
  const scheme = useMemo(() => coverSchemeForListingId(listingId), [listingId]);
  const colors = isLight ? scheme.light : scheme.dark;
  const bgStyle = useMemo(
    () => coverBackgroundStyle(listingId, isLight),
    [listingId, isLight]
  );
  const lucideName = useMemo(
    () =>
      resolveCoverLucideIcon({
        title,
        description,
        category,
        subcategory,
      }),
    [title, description, category, subcategory]
  );
  const LucideIconComp = lucideName ? LUCIDE_MAP[lucideName] : null;
  const iconCategoryId = useMemo(
    () => resolveCoverIconCategoryId(category, subcategory),
    [category, subcategory]
  );
  const iconSrc = coverIconPath(iconCategoryId, isLight);
  const displayTitle = useMemo(
    () => shortenCoverTitle(title, description, cfg.maxTitle),
    [title, description, cfg.maxTitle]
  );

  return (
    <div
      className={`absolute inset-0 flex flex-col overflow-hidden select-none ${cfg.padX} ${cfg.padY} ${className}`}
      style={bgStyle}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.2]"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 55% at 50% 12%, ${colors.bgAccent}aa 0%, transparent 70%),
            radial-gradient(ellipse 70% 50% at 50% 100%, ${colors.bgDeep}99 0%, transparent 65%)`,
        }}
      />

      <div
        className={`relative z-[1] flex flex-1 justify-center ${
          showTitle ? 'items-end pb-2 sm:pb-3' : 'items-center pb-8 pt-2'
        }`}
      >
        {LucideIconComp ? (
          <LucideIconComp
            size={cfg.icon}
            strokeWidth={1.75}
            className="shrink-0 opacity-90"
            style={{ color: colors.fg }}
            aria-hidden
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconSrc}
            alt=""
            width={cfg.icon}
            height={cfg.icon}
            className="shrink-0 object-contain opacity-90"
            draggable={false}
          />
        )}
      </div>

      {showTitle ? (
        <div className="relative z-[1] flex w-full shrink-0 items-start justify-center pt-1">
          <p
            className={`w-full max-w-[16rem] text-center break-words ${cfg.titleClass}`}
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
      ) : null}
    </div>
  );
}

export const ListingAutoCover = memo(ListingAutoCoverInner);
