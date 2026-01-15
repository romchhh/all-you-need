import React from 'react';

interface CategoryIconProps {
  categoryId: string;
  className?: string;
  isActive?: boolean;
  size?: number;
}

const iconMap: Record<string, string> = {
  'fashion': '/images/categories_icons/fashion.svg',
  'furniture': '/images/categories_icons/furniture.svg',
  'electronics': '/images/categories_icons/electronics.svg',
  'appliances': '/images/categories_icons/home.svg',
  'kids': '/images/categories_icons/kids.svg',
  'home': '/images/categories_icons/home.svg',
  'auto': '/images/categories_icons/auto.svg',
  'hobby_sports': '/images/categories_icons/hobby_sports.svg',
  'realestate': '/images/categories_icons/realestate.svg',
  'services_work': '/images/categories_icons/services_work.svg',
  'free': '/images/categories_icons/free.svg',
  'all_categories': '/images/categories_icons/all_categories.svg',
};

export const CategoryIcon: React.FC<CategoryIconProps> = ({ categoryId, className = '', isActive = false, size = 32 }) => {
  const iconPath = iconMap[categoryId];
  
  if (!iconPath) {
    return null;
  }

  return (
    <div className={`flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <img
        src={iconPath}
        alt={categoryId}
        width={size}
        height={size}
        className="object-contain"
        style={{
          filter: isActive ? 'brightness(0) saturate(100%) invert(85%) sepia(20%) saturate(500%) hue-rotate(60deg) brightness(110%)' : 'none',
        }}
      />
    </div>
  );
};
