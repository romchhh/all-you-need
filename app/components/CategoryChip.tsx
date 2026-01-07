import { Category } from '@/types';

interface CategoryChipProps {
  category: Category;
  isActive?: boolean;
  onClick?: () => void;
}

export const CategoryChip = ({ category, isActive = false, onClick }: CategoryChipProps) => (
  <div 
    className="flex flex-col items-center min-w-[80px] max-w-[90px] cursor-pointer flex-shrink-0"
    onClick={onClick}
  >
    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl mb-1.5 transition-all ${
      isActive 
        ? 'bg-blue-500 text-white' 
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}>
      {category.icon}
    </div>
    <span className={`text-xs font-medium text-center whitespace-normal leading-tight px-0.5 ${
      isActive ? 'text-blue-600' : 'text-gray-700'
    }`}>
      {category.name}
    </span>
  </div>
);

