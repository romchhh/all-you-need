import { Subcategory } from '@/types';
import { TelegramWebApp } from '@/types/telegram';

interface SubcategoryListProps {
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSelect: (subcategoryId: string | null) => void;
  tg: TelegramWebApp | null;
}

export const SubcategoryList = ({ subcategories, selectedSubcategory, onSelect, tg }: SubcategoryListProps) => {
  if (!subcategories || subcategories.length === 0) return null;

  return (
    <div className="px-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-600">Типи</h3>
        {selectedSubcategory && (
          <button
            onClick={() => {
              onSelect(null);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="text-xs text-blue-600"
          >
            Очистити
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            onSelect(null);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            selectedSubcategory === null
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Всі
        </button>
        {subcategories.map((subcategory) => (
          <button
            key={subcategory.id}
            onClick={() => {
              onSelect(subcategory.id);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
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
  );
};

