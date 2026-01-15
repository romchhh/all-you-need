'use client';

import { X, ChevronRight } from 'lucide-react';
import { Category } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const categories = getCategories(t);

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end overflow-hidden" onClick={onClose}>
      <div 
        className="w-full rounded-t-3xl border-t-2 border-white max-h-[90vh] flex flex-col animate-slide-up" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
        }}
      >
        {/* Хедер */}
        <div className="border-b border-gray-700/50 px-4 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-white">{t('categories.title') || 'Категорії'}</h2>
          <button
            onClick={() => {
              onClose();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full bg-gray-800/50 flex items-center justify-center hover:bg-gray-700/50 transition-colors"
          >
            <X size={20} className="text-white" />
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
            className="w-full flex items-center gap-4 px-4 py-4 border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors"
          >
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border border-white relative overflow-hidden"
              style={{
                background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
              }}
            >
              <CategoryIcon categoryId="all_categories" size={24} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="font-semibold text-white text-base">{t('bazaar.allCategories')}</div>
              <div className="text-sm text-gray-400 mt-0.5">{t('categories.allCategoriesDescription') || 'Переглянути всі оголошення'}</div>
            </div>
            <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
          </button>

          {/* Список категорій */}
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className="w-full flex items-center gap-4 px-4 py-4 border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors"
            >
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border border-white relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
                }}
              >
                <CategoryIcon categoryId={category.id} size={24} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="font-semibold text-white text-base">{category.name}</div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {t(`categories.description.${category.id}`) || ''}
                </div>
              </div>
              <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
            </button>
          ))}
          {/* Додатковий padding знизу для комфортного скролу */}
          <div className="h-4"></div>
        </div>
      </div>
    </div>
  );
};

