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

  const img = (
    <img
      src={iconPath}
      alt=""
      width={size}
      height={size}
      className="block max-w-full max-h-full object-contain"
      style={{
        filter: isActive
          ? 'brightness(0) saturate(100%) invert(85%) sepia(20%) saturate(500%) hue-rotate(60deg) brightness(110%)'
          : 'none',
      }}
    />
  );

  if (isLight) {
    return (
      <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
        <div className="rounded-lg border-2 border-[#3F5331] bg-white p-0.5 box-border inline-flex items-center justify-center">
          {img}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
      {img}
    </div>
  );
};
