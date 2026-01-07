'use client';

import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, Fragment, useMemo, useCallback, useRef } from 'react';
import { Category } from '@/types';
import { getCategories } from '@/constants/categories';
import { getCurrencySymbol, Currency } from '@/utils/currency';

// Стилі для повзунків
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;

type SortOption = 'newest' | 'price_low' | 'price_high' | 'popular';
type ConditionOption = 'new' | 'used' | null;

interface SortModalProps {
  isOpen: boolean;
  currentSort: SortOption;
  showFreeOnly: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  selectedCategory?: string | null;
  selectedSubcategory?: string | null;
  selectedCondition?: ConditionOption;
  selectedCurrency?: Currency | null;
  onClose: () => void;
  onSelect: (sort: SortOption) => void;
  onToggleFreeOnly: (value: boolean) => void;
  onPriceRangeChange: (min: number | null, max: number | null) => void;
  onCategoryChange?: (categoryId: string | null, subcategoryId: string | null) => void;
  onConditionChange?: (condition: ConditionOption) => void;
  onCurrencyChange?: (currency: Currency | null) => void;
  tg: TelegramWebApp | null;
}

export const SortModal = ({ 
  isOpen, 
  currentSort, 
  showFreeOnly,
  minPrice,
  maxPrice,
  selectedCategory = null,
  selectedSubcategory = null,
  selectedCondition = null,
  selectedCurrency = null,
  onClose, 
  onSelect, 
  onToggleFreeOnly,
  onPriceRangeChange,
  onCategoryChange,
  onConditionChange,
  onCurrencyChange,
  tg 
}: SortModalProps) => {
  const { t } = useLanguage();
  const categories = getCategories(t);
  
  // Функція для визначення максимальної ціни залежно від категорії
  const getMaxPrice = (categoryId: string | null): number => {
    if (categoryId === 'auto' || categoryId === 'realestate') {
      return 100000; // Для авто та нерухомості
    }
    return 1000; // Для інших категорій
  };
  
  const [localMinPrice, setLocalMinPrice] = useState<number>(minPrice || 0);
  const [localMaxPrice, setLocalMaxPrice] = useState<number>(maxPrice || getMaxPrice(selectedCategory));
  const [localCurrency, setLocalCurrency] = useState<Currency | null>(selectedCurrency || null);
  const [localSelectedCategory, setLocalSelectedCategory] = useState<string | null>(selectedCategory);
  const [localSelectedSubcategory, setLocalSelectedSubcategory] = useState<string | null>(selectedSubcategory);
  const [localCondition, setLocalCondition] = useState<ConditionOption>(selectedCondition);
  
  // Зберігаємо функції в ref для гарантії актуальності
  const onCloseRef = useRef(onClose);
  const onPriceRangeChangeRef = useRef(onPriceRangeChange);
  const onCategoryChangeRef = useRef(onCategoryChange);
  const onConditionChangeRef = useRef(onConditionChange);
  const onCurrencyChangeRef = useRef(onCurrencyChange);

  useEffect(() => {
    onCloseRef.current = onClose;
    onPriceRangeChangeRef.current = onPriceRangeChange;
    onCategoryChangeRef.current = onCategoryChange;
    onConditionChangeRef.current = onConditionChange;
    onCurrencyChangeRef.current = onCurrencyChange;
  }, [onClose, onPriceRangeChange, onCategoryChange, onConditionChange, onCurrencyChange]);

  useEffect(() => {
    if (isOpen) {
      const maxPriceForCategory = getMaxPrice(selectedCategory);
      setLocalMinPrice(minPrice || 0);
      setLocalMaxPrice(maxPrice || maxPriceForCategory);
      setLocalCurrency(selectedCurrency || null);
      setLocalSelectedCategory(selectedCategory);
      setLocalSelectedSubcategory(selectedSubcategory);
      setLocalCondition(selectedCondition);
      // Зберігаємо поточну позицію скролу
      const scrollY = window.scrollY;
      // Блокуємо скрол на body та html
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Розблоковуємо скрол
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
    
    // Cleanup при розмонтуванні
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen, minPrice, maxPrice, selectedCurrency, selectedCategory, selectedSubcategory, selectedCondition]);
  
  // Оновлюємо максимальну ціну при зміні категорії
  useEffect(() => {
    if (isOpen) {
      const maxPriceForCategory = getMaxPrice(localSelectedCategory);
      if (localMaxPrice > maxPriceForCategory) {
        setLocalMaxPrice(maxPriceForCategory);
      }
      if (localMinPrice > maxPriceForCategory) {
        setLocalMinPrice(0);
      }
    }
  }, [localSelectedCategory, isOpen]);

  const sortOptions: { value: SortOption; labelKey: string }[] = [
    { value: 'newest', labelKey: 'bazaar.sort.newest' },
    { value: 'price_low', labelKey: 'bazaar.sort.priceLow' },
    { value: 'price_high', labelKey: 'bazaar.sort.priceHigh' },
    { value: 'popular', labelKey: 'bazaar.sort.popular' }
  ];

  const currencyOptions: Currency[] = ['EUR', 'UAH', 'USD'];

  const selectedCategoryData = useMemo(() => {
    return categories.find(cat => cat.id === localSelectedCategory);
  }, [categories, localSelectedCategory]);

  // Обробка скидання всіх фільтрів
  const handleReset = () => {
    // Скидаємо локальні стани
    setLocalMinPrice(0);
    setLocalMaxPrice(1000); // Стандартний максимум
    setLocalCurrency(null);
    setLocalSelectedCategory(null);
    setLocalSelectedSubcategory(null);
    setLocalCondition(null);
    
    // Застосовуємо скидання до батьківського компонента
    onPriceRangeChange(null, null);
    onToggleFreeOnly(false);
    onSelect('newest');
    if (onCategoryChange) {
      onCategoryChange(null, null);
    }
    if (onConditionChange) {
      onConditionChange(null);
    }
    if (onCurrencyChange) {
      onCurrencyChange(null);
    }
  };

  // Обробка вибору категорії
  const handleCategorySelect = (categoryId: string) => {
    if (localSelectedCategory === categoryId) {
      setLocalSelectedCategory(null);
      setLocalSelectedSubcategory(null);
    } else {
      setLocalSelectedCategory(categoryId);
      setLocalSelectedSubcategory(null);
    }
  };

  // Обробка вибору підкатегорії
  const handleSubcategorySelect = (subcategoryId: string) => {
    setLocalSelectedSubcategory(subcategoryId);
  };

  // Обробка вибору стану товару
  const handleConditionSelect = (condition: ConditionOption) => {
    setLocalCondition(condition);
  };

  // Обробка вибору валюти
  const handleCurrencySelect = (currency: Currency | null) => {
    setLocalCurrency(currency);
  };

  if (!isOpen) return null;

  // Перевіряємо реальні застосовані фільтри
  const maxPriceForCurrentCategory = getMaxPrice(selectedCategory);
  const hasActiveFilters = 
    currentSort !== 'newest' || 
    showFreeOnly || 
    (minPrice !== null && minPrice !== 0) || 
    (maxPrice !== null && maxPrice !== maxPriceForCurrentCategory) || 
    selectedCategory !== null || 
    selectedSubcategory !== null || 
    selectedCondition !== null || 
    selectedCurrency !== null;

  return (
    <Fragment>
      <style>{sliderStyles}</style>
      <div 
        className="fixed inset-0 bg-black/40 z-50 flex items-end" 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div 
          className="w-full bg-white rounded-t-3xl flex flex-col max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Закріплена шапка */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-xl font-bold text-gray-900">{t('common.filter')}</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <X size={18} className="text-gray-900" />
            </button>
          </div>

          {/* Скролований контент */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6 pb-32">
              {/* Сортування - горизонтальний скрол */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('common.sort')}</h4>
                <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <div className="flex gap-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          onSelect(option.value);
                          onClose();
                        }}
                        className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex-shrink-0 ${
                          currentSort === option.value
                            ? 'bg-blue-500 text-white font-medium'
                            : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                        }`}
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Категорії */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('bazaar.categories')}</h4>
                <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <div className="flex gap-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => handleCategorySelect(category.id)}
                        className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex-shrink-0 flex items-center gap-2 ${
                          localSelectedCategory === category.id
                            ? 'bg-blue-500 text-white font-medium'
                            : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                        }`}
                      >
                        <span>{category.icon}</span>
                        <span>{category.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Підкатегорії */}
                {selectedCategoryData && selectedCategoryData.subcategories && selectedCategoryData.subcategories.length > 0 && (
                  <div className="mt-3">
                    <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', paddingLeft: '16px' }}>
                      <div className="flex gap-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
                        {selectedCategoryData.subcategories.map((subcategory) => (
                          <button
                            key={subcategory.id}
                            onClick={() => handleSubcategorySelect(subcategory.id)}
                            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex-shrink-0 ${
                              localSelectedSubcategory === subcategory.id
                                ? 'bg-blue-500 text-white font-medium'
                                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                            }`}
                          >
                            {subcategory.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Стан товару - Новое/БУ */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('bazaar.condition')}</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConditionSelect(localCondition === 'new' ? null : 'new')}
                    className={`flex-1 px-4 py-3 rounded-xl transition-all ${
                      localCondition === 'new'
                        ? 'bg-blue-500 text-white font-medium'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {t('listing.new')}
                  </button>
                  <button
                    onClick={() => handleConditionSelect(localCondition === 'used' ? null : 'used')}
                    className={`flex-1 px-4 py-3 rounded-xl transition-all ${
                      localCondition === 'used'
                        ? 'bg-blue-500 text-white font-medium'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {t('listing.used')}
                  </button>
                </div>
              </div>

              {/* Вибір валюти */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('common.currency')}</h4>
                <div className="flex gap-2">
                  {currencyOptions.map((currency) => (
                    <button
                      key={currency}
                      onClick={() => handleCurrencySelect(currency)}
                      className={`flex-1 px-4 py-3 rounded-xl transition-all ${
                        localCurrency === currency
                          ? 'bg-blue-500 text-white font-medium'
                          : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      }`}
                    >
                      {getCurrencySymbol(currency)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Діапазон цін */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('bazaar.priceRange')}</h4>
                
                {/* Повзунки */}
                {(() => {
                  const currentMaxPrice = getMaxPrice(localSelectedCategory);
                  return (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs text-gray-500">{t('bazaar.minPrice')}</label>
                      <span className="text-sm font-semibold text-gray-900">{localMinPrice} {localCurrency ? getCurrencySymbol(localCurrency) : '€'}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                          max={currentMaxPrice}
                          step="5"
                      value={localMinPrice}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setLocalMinPrice(value);
                        if (value > localMaxPrice) {
                          setLocalMaxPrice(value);
                        }
                      }}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(localMinPrice / currentMaxPrice) * 100}%, #e5e7eb ${(localMinPrice / currentMaxPrice) * 100}%, #e5e7eb 100%)`
                      }}
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs text-gray-500">{t('bazaar.maxPrice')}</label>
                      <span className="text-sm font-semibold text-gray-900">{localMaxPrice} {localCurrency ? getCurrencySymbol(localCurrency) : '€'}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                          max={currentMaxPrice}
                          step="5"
                      value={localMaxPrice}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setLocalMaxPrice(value);
                        if (value < localMinPrice) {
                          setLocalMinPrice(value);
                        }
                      }}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                            background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${(localMaxPrice / currentMaxPrice) * 100}%, #3b82f6 ${(localMaxPrice / currentMaxPrice) * 100}%, #3b82f6 100%)`
                      }}
                    />
                  </div>
                </div>
                  );
                })()}
              </div>

              {/* Безкоштовні */}
              <div>
                <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={showFreeOnly}
                    onChange={(e) => {
                      onToggleFreeOnly(e.target.checked);
                      onClose();
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-900 font-medium">{t('bazaar.freeOnly')}</span>
                </label>
              </div>

              {/* Кнопка Застосувати */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Обчислюємо мінімальну та максимальну ціну
                    const currentMaxPrice = getMaxPrice(localSelectedCategory);
                    const min = localMinPrice > 0 ? localMinPrice : null;
                    const max = localMaxPrice < currentMaxPrice ? localMaxPrice : null;
                    
                    // Застосовуємо всі фільтри через ref для гарантії
                    onPriceRangeChangeRef.current(min, max);
                    
                    if (onCategoryChangeRef.current) {
                      onCategoryChangeRef.current(localSelectedCategory, localSelectedSubcategory);
                    }
                    
                    if (onConditionChangeRef.current) {
                      onConditionChangeRef.current(localCondition);
                    }
                    
                    if (onCurrencyChangeRef.current) {
                      onCurrencyChangeRef.current(localCurrency);
                    }
                    
                    // Закриваємо модальне вікно через setTimeout для гарантії застосування змін
                    setTimeout(() => {
                      onCloseRef.current();
                    }, 50);
                  }}
                  className="w-full px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors active:bg-blue-700 cursor-pointer"
                >
                  {t('common.apply')}
                </button>
              </div>
            </div>
          </div>

          {/* Закріплені кнопки дій */}
            {hasActiveFilters && (
            <div className="p-6 border-t border-gray-200 flex-shrink-0 bg-white relative z-10">
              <button
                type="button"
                onClick={() => handleReset()}
                className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors active:bg-gray-300"
              >
                {t('bazaar.reset')}
              </button>
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
};
