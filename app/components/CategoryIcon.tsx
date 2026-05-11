'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface CategoryIconProps {
  categoryId: string;
  className?: string;
  isActive?: boolean;
  size?: number;
}

/** Світлі іконки (білий штрих) — темна тема. Темні (#3F5331) — у `dark/` для світлої теми. */
const iconMap: Record<string, string> = {
  fashion: '/images/categories_icons/fashion.svg',
  beauty_wellness: '/images/categories_icons/Group.svg',
  furniture: '/images/categories_icons/furniture.svg',
  electronics: '/images/categories_icons/electronics.svg',
  appliances: '/images/categories_icons/Group 2.svg',
  kids: '/images/categories_icons/kids.svg',
  home: '/images/categories_icons/home.svg',
  auto: '/images/categories_icons/auto.svg',
  hobby_sports: '/images/categories_icons/hobby_sports.svg',
  realestate: '/images/categories_icons/realestate.svg',
  services_work: '/images/categories_icons/services_work.svg',
  free: '/images/categories_icons/free.svg',
  all_categories: '/images/categories_icons/all_categories.svg',
};

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
  const defaultPath = iconMap[categoryId];

  if (!defaultPath) {
    return null;
  }

  const useDarkAsset = isLight && !isActive;
  const iconPath = useDarkAsset ? toDarkVariantPath(defaultPath) : defaultPath;

  const enlarge = LARGER_ICON_IDS.has(categoryId);
  const imgStyle: React.CSSProperties = {
    ...(enlarge
      ? { transform: `scale(${LARGER_ICON_SCALE})`, transformOrigin: 'center center' }
      : {}),
    filter: isActive
      ? 'brightness(0) saturate(100%) invert(85%) sepia(20%) saturate(500%) hue-rotate(60deg) brightness(110%)'
      : 'none',
  };

  const img = (
    <img
      src={iconPath}
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
