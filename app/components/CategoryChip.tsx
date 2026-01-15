import { Category } from '@/types';
import { CategoryIcon } from './CategoryIcon';

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
    <div 
      className={`w-14 h-14 rounded-xl flex items-center justify-center mb-1.5 transition-all relative overflow-hidden border ${
        isActive ? 'border-[#D3F1A7]' : 'border-white'
      }`}
      style={{
        background: isActive
          ? 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
          : 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
      }}
    >
      <CategoryIcon categoryId={category.id} isActive={isActive} size={32} />
    </div>
    <span className={`text-xs font-medium text-center whitespace-normal leading-tight px-0.5 ${
      isActive ? 'text-[#D3F1A7]' : 'text-white'
    }`}>
      {category.name}
    </span>
  </div>
);

