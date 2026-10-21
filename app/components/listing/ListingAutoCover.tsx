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
  {
    icon: number;
    titleClass: string;
    padX: string;
    gap: string;
    lines: number;
    maxTitle: number;
  }
> = {
  sm: {
    icon: 22,
    titleClass: 'text-[9px] leading-tight font-semibold tracking-tight sm:text-[10px]',
    padX: 'px-1.5',
    gap: 'gap-1',
    lines: 2,
    maxTitle: 26,
  },
  md: {
    icon: 34,
    titleClass: 'text-xs leading-snug font-semibold tracking-tight sm:text-[13px]',
    padX: 'px-3',
    gap: 'gap-2',
    lines: 2,
    maxTitle: 36,
  },
  lg: {
    icon: 44,
    titleClass: 'text-sm leading-snug font-semibold tracking-tight sm:text-[15px]',
    padX: 'px-6',
    gap: 'gap-2.5',
    lines: 2,
    maxTitle: 40,
  },
};

/**
 * Вертикальна обкладинка: іконка + коротка назва послуги по центру.
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
    () => shortenCoverTitle(title, description, cfg.maxTitle, category, subcategory),
    [title, description, cfg.maxTitle, category, subcategory]
  );

  const iconNode = LucideIconComp ? (
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
      className="mx-auto shrink-0 object-contain opacity-90"
      style={{ width: cfg.icon, height: cfg.icon }}
      draggable={false}
    />
  );

  return (
    <div
      className={`absolute inset-0 select-none overflow-hidden ${className}`}
      style={bgStyle}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `radial-gradient(ellipse 75% 50% at 50% 20%, ${colors.bgAccent}aa 0%, transparent 70%),
            radial-gradient(ellipse 65% 40% at 50% 100%, ${colors.bgDeep}99 0%, transparent 65%)`,
        }}
      />

      {showTitle ? (
        <div
          className={`absolute inset-0 z-[1] flex flex-col items-center justify-center text-center ${cfg.padX} ${
            size === 'sm' ? 'py-2' : 'py-5'
          } ${cfg.gap}`}
        >
          <div className="flex shrink-0 items-center justify-center">{iconNode}</div>
          <p
            className={`mx-auto w-full shrink-0 text-center ${
              size === 'sm' ? 'max-w-[5rem]' : 'max-w-[12rem]'
            } ${cfg.titleClass}`}
            style={{
              color: colors.fg,
              display: '-webkit-box',
              WebkitLineClamp: cfg.lines,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              textAlign: 'center',
            }}
          >
            {displayTitle}
          </p>
        </div>
      ) : (
        <div className="absolute inset-0 z-[1] flex items-center justify-center">
          {iconNode}
        </div>
      )}
    </div>
  );
}

export const ListingAutoCover = memo(ListingAutoCoverInner);
