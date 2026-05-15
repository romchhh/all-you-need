'use client';

import { Category } from '@/types';
import { CategoryIcon } from './CategoryIcon';
import { useTheme } from '@/contexts/ThemeContext';

interface CategoryChipProps {
  category: Category;
  isActive?: boolean;
  onClick?: () => void;
}

export const CategoryChip = ({ category, isActive = false, onClick }: CategoryChipProps) => {
  const { isLight } = useTheme();

  return (
    <div
      className="flex flex-col items-center min-w-[80px] max-w-[90px] cursor-pointer flex-shrink-0"
      onClick={onClick}
    >
      <div
        className={`w-14 h-14 rounded-xl flex items-center justify-center mb-1.5 transition-all relative overflow-hidden ${
          isActive
            ? isLight
              ? 'border-2 border-[#3F5331] bg-[#3F5331]/15 shadow-sm'
              : 'border border-[#C8E6A0] bg-[#C8E6A0]/10 shadow-[0_0_12px_rgba(200,230,160,0.2)]'
            : isLight
              ? 'border-2 border-[#3F5331] bg-white'
              : 'border border-white/25 bg-[#1C1C1C]'
        }`}
      >
        <CategoryIcon categoryId={category.id} isActive={isActive} size={32} />
      </div>
      <span
        className={`text-xs font-medium text-center whitespace-normal leading-tight px-0.5 ${
          isActive ? (isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]') : isLight ? 'text-gray-800' : 'text-white'
        }`}
      >
        {category.name}
      </span>
    </div>
  );
};

