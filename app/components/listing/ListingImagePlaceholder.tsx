'use client';

export const LISTING_PLACEHOLDER_LOGO_SRC = '/images/mini-logo-placeholder.png';

type ListingImagePlaceholderSize = 'sm' | 'md' | 'lg';

const LOGO_SIZE_CLASS: Record<ListingImagePlaceholderSize, string> = {
  sm: 'h-9 w-9 sm:h-10 sm:w-10',
  md: 'h-12 w-12 sm:h-14 sm:w-14',
  lg: 'h-14 w-14 sm:h-16 sm:w-16',
};

interface ListingImagePlaceholderProps {
  isLight: boolean;
  size?: ListingImagePlaceholderSize;
  className?: string;
  logoClassName?: string;
}

/** Фон і лого для оголошень без фото (світла тема — білий фон). */
export function ListingImagePlaceholder({
  isLight,
  size = 'md',
  className = '',
  logoClassName,
}: ListingImagePlaceholderProps) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${
        isLight ? 'bg-white' : 'bg-[#1A1A1A]'
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LISTING_PLACEHOLDER_LOGO_SRC}
        alt=""
        className={`object-contain select-none pointer-events-none opacity-95 ${
          logoClassName ?? LOGO_SIZE_CLASS[size]
        }`}
        draggable={false}
      />
    </div>
  );
}
