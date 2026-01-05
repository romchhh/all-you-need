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
      <div className="flex items-center justify-between mb-3 px-4">
        <h3 className="text-sm font-semibold text-gray-700">{t('common.subcategories')}</h3>
      </div>
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
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              selectedSubcategory === null
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                selectedSubcategory === subcategory.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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

