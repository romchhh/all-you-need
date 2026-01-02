import { Category } from '@/types';

interface CategoryChipProps {
  category: Category;
  isActive?: boolean;
  onClick?: () => void;
}

export const CategoryChip = ({ category, isActive = false, onClick }: CategoryChipProps) => (
  <div 
    className="flex flex-col items-center min-w-[100px] max-w-[120px] cursor-pointer"
    onClick={onClick}
  >
    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-2 transition-all ${
      isActive 
        ? 'bg-blue-500 text-white' 
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}>
      {category.icon}
    </div>
    <span className={`text-xs font-medium text-center whitespace-normal leading-tight ${
      isActive ? 'text-blue-600' : 'text-gray-700'
    }`}>
      {category.name}
    </span>
  </div>
);

