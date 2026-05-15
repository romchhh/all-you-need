'use client';

import { X, ChevronRight } from 'lucide-react';
import { Category } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getCategories } from '@/constants/categories';
import { CategoryIcon } from './CategoryIcon';
import { useEffect } from 'react';

interface CategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory: (categoryId: string | null) => void;
  tg: TelegramWebApp | null;
}

export const CategoriesModal = ({
  isOpen,
  onClose,
  onSelectCategory,
  tg
}: CategoriesModalProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const categories = getCategories(t);
  const sheetBackground = isLight
    ? 'radial-gradient(ellipse 85% 100% at 18% 0%, rgba(63, 83, 49, 0.14) 0%, transparent 45%), linear-gradient(180deg, #ffffff 0%, #f6f8f4 100%)'
    : 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000';
  // Блокуємо скрол body при відкритому модальному вікні
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCategoryClick = (categoryId: string) => {
    onSelectCategory(categoryId);
    onClose();
    tg?.HapticFeedback.impactOccurred('light');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/50 backdrop-blur-sm md:items-center md:p-6"
      onClick={onClose}
    >
      <div 
        className={`flex max-h-[90vh] w-full max-w-full flex-col animate-slide-up rounded-t-3xl border-t-2 md:max-h-[85vh] md:max-w-md md:rounded-2xl md:border-2 ${
          isLight ? 'border-gray-200 md:border-gray-200' : 'border-white md:border-white/25'
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: sheetBackground,
        }}
      >
        {/* Хедер */}
        <div
          className={`relative flex flex-shrink-0 items-center justify-center border-b px-4 py-4 md:px-5 ${
            isLight ? 'border-gray-200' : 'border-gray-700/50'
          }`}
        >
          <h2 className={`text-center text-xl font-bold md:pr-10 ${ac.pageHeading}`}>
            {t('categories.title') || 'Категорії'}
          </h2>
          <button
            onClick={() => {
              onClose();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
              isLight ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-800/50 hover:bg-gray-700/50'
            }`}
          >
            <X size={20} className={isLight ? 'text-gray-800' : 'text-white'} />
          </button>
        </div>

        {/* Список категорій */}
        <div 
          className="overflow-y-auto" 
          style={{ 
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            maxHeight: 'calc(90vh - 73px)',
            flex: '1 1 auto',
            minHeight: 0
          }}
        >
          {/* Кнопка "Всі категорії" */}
          <button
            onClick={() => {
              onSelectCategory(null);
              onClose();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`w-full flex items-center gap-4 px-4 py-4 border-b transition-colors ${
              isLight ? 'border-gray-200 hover:bg-gray-100' : 'border-gray-700/50 hover:bg-gray-800/30'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden ${
                isLight ? 'bg-gray-100' : 'border border-white/25 bg-[#1C1C1C]'
              }`}
            >
              <CategoryIcon categoryId="all_categories" size={24} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className={`font-semibold text-base ${ac.pageHeading}`}>{t('bazaar.allCategories')}</div>
              <div className={`text-sm mt-0.5 ${ac.mutedText}`}>
                {t('categories.allCategoriesDescription') || 'Переглянути всі оголошення'}
              </div>
            </div>
            <ChevronRight
              size={20}
              className={`flex-shrink-0 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}
            />
          </button>

          {/* Список категорій */}
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className={`w-full flex items-center gap-4 px-4 py-4 border-b transition-colors ${
                isLight ? 'border-gray-200 hover:bg-gray-100' : 'border-gray-700/50 hover:bg-gray-800/30'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden ${
                  isLight ? 'bg-gray-100' : 'border border-white/25 bg-[#1C1C1C]'
                }`}
              >
                <CategoryIcon categoryId={category.id} size={24} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className={`font-semibold text-base ${ac.pageHeading}`}>{category.name}</div>
                <div className={`text-sm mt-0.5 ${ac.mutedText}`}>
                  {t(`categories.description.${category.id}`) || ''}
                </div>
              </div>
              <ChevronRight
                size={20}
                className={`flex-shrink-0 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}
              />
            </button>
          ))}
          {/* Додатковий padding знизу для комфортного скролу */}
          <div className="h-4"></div>
        </div>
      </div>
    </div>
  );
};

