import { Subcategory } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';

interface SubcategoryListProps {
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSelect: (subcategoryId: string | null) => void;
  tg: TelegramWebApp | null;
}

export const SubcategoryList = ({ subcategories, selectedSubcategory, onSelect, tg }: SubcategoryListProps) => {
  const { t } = useLanguage();
  if (!subcategories || subcategories.length === 0) return null;

  return (
    <div className="mb-4">
      <div 
        className="overflow-x-auto -mx-4 w-full scrollbar-hide" 
        style={{ 
          maxWidth: '100vw',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingLeft: '16px'
        }}
      >
        <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
          <button
            onClick={() => {
              onSelect(null);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
              selectedSubcategory === null
                ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                : 'border-white text-white bg-transparent hover:bg-white/10'
            }`}
          >
            {t('common.all')}
          </button>
          {subcategories.map((subcategory) => (
            <button
              key={subcategory.id}
              onClick={() => {
                onSelect(subcategory.id);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
                selectedSubcategory === subcategory.id
                  ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                  : 'border-white text-white bg-transparent hover:bg-white/10'
              }`}
            >
              {subcategory.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

