'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { CATEGORY_ICON_CACHE_BUST, CATEGORY_ICON_PATHS } from '@/lib/listings/autoCover';

interface CategoryIconProps {
  categoryId: string;
  className?: string;
  isActive?: boolean;
  size?: number;
}

/** Трохи більший масштаб гліфа (однаково у світлій і темній темі) */
const LARGER_ICON_IDS = new Set(['appliances', 'beauty_wellness']);
const LARGER_ICON_SCALE = 1.16;

function toDarkVariantPath(defaultPath: string): string {
  return defaultPath.replace(
    '/images/categories_icons/',
    '/images/categories_icons/dark/'
  );
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  categoryId,
  className = '',
  isActive = false,
  size = 32,
}) => {
  const { isLight } = useTheme();
  const defaultPath =
    CATEGORY_ICON_PATHS[categoryId] || CATEGORY_ICON_PATHS.all_categories;

  // Light theme: always #3F5331 assets. Dark theme: white assets; salad tint only when active.
  const iconPath = isLight ? toDarkVariantPath(defaultPath) : defaultPath;

  const enlarge = LARGER_ICON_IDS.has(categoryId);
  const imgStyle: React.CSSProperties = {
    ...(enlarge
      ? { transform: `scale(${LARGER_ICON_SCALE})`, transformOrigin: 'center center' }
      : {}),
    filter:
      isActive && !isLight
        ? 'brightness(0) saturate(100%) invert(85%) sepia(20%) saturate(500%) hue-rotate(60deg) brightness(110%)'
        : 'none',
  };

  const img = (
    <img
      src={`${iconPath}?v=${CATEGORY_ICON_CACHE_BUST}`}
      alt=""
      width={size}
      height={size}
      className="block max-w-full max-h-full object-contain"
      style={imgStyle}
    />
  );

  /* У світлій темі зелена рамка лише на батьківській кнопці/плитці — тут тільки іконка без обводки */
  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-visible ${className}`}
      style={{ width: size, height: size }}
    >
      {img}
    </div>
  );
};
