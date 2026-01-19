import { Subcategory } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';

interface SubcategoryListProps {
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSelect: (subcategoryId: string | null) => void;
  tg: TelegramWebApp | null;
  categoryId?: string | null;
}

export const SubcategoryList = ({ subcategories, selectedSubcategory, onSelect, tg, categoryId }: SubcategoryListProps) => {
  const { t } = useLanguage();
  if (!subcategories || subcategories.length === 0) return null;

  // Для категорії "Послуги та робота" розділяємо підкатегорії на дві групи
  const isServicesWork = categoryId === 'services_work';
  
  // Підкатегорії, що стосуються роботи
  const workSubcategories = ['vacancies', 'part_time', 'looking_for_work', 'other_work'];
  
  // Розділяємо підкатегорії на послуги та роботу
  const servicesSubcategories = isServicesWork 
    ? subcategories.filter(sub => !workSubcategories.includes(sub.id))
    : subcategories;
  const workSubcategoriesList = isServicesWork
    ? subcategories.filter(sub => workSubcategories.includes(sub.id))
    : [];

  const renderSubcategoryButton = (subcategory: Subcategory) => (
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
  );

  const renderSubcategoryRow = (subcategoriesToRender: Subcategory[]) => (
    <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
      {subcategoriesToRender.map(renderSubcategoryButton)}
    </div>
  );

  if (isServicesWork && workSubcategoriesList.length > 0) {
    // Відображаємо в 2 ряди для категорії "Послуги та робота"
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
          {/* Перший ряд: кнопка "Всі" + послуги */}
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
            {servicesSubcategories.map(renderSubcategoryButton)}
          </div>
          
          {/* Другий ряд: робота */}
          <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
            {workSubcategoriesList.map(renderSubcategoryButton)}
          </div>
        </div>
      </div>
    );
  }

  // Звичайне відображення в один ряд для інших категорій
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
          {subcategories.map(renderSubcategoryButton)}
        </div>
      </div>
    </div>
  );
};

