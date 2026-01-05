'use client';

import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, Fragment, useMemo } from 'react';
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
  const [localMinPrice, setLocalMinPrice] = useState<number>(minPrice || 0);
  const [localMaxPrice, setLocalMaxPrice] = useState<number>(maxPrice || 10000);
  const [localCurrency, setLocalCurrency] = useState<Currency | null>(selectedCurrency || null);
  const [localSelectedCategory, setLocalSelectedCategory] = useState<string | null>(selectedCategory);
  const [localSelectedSubcategory, setLocalSelectedSubcategory] = useState<string | null>(selectedSubcategory);
  const [localCondition, setLocalCondition] = useState<ConditionOption>(selectedCondition);

  useEffect(() => {
    if (isOpen) {
      setLocalMinPrice(minPrice || 0);
      setLocalMaxPrice(maxPrice || 10000);
      setLocalCurrency(selectedCurrency || null);
      setLocalSelectedCategory(selectedCategory);
      setLocalSelectedSubcategory(selectedSubcategory);
      setLocalCondition(selectedCondition);
    }
  }, [isOpen, minPrice, maxPrice, selectedCurrency, selectedCategory, selectedSubcategory, selectedCondition]);

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

  const handleApplyPriceRange = () => {
    const min = localMinPrice > 0 ? localMinPrice : null;
    const max = localMaxPrice < 10000 ? localMaxPrice : null;
    onPriceRangeChange(min, max);
    tg?.HapticFeedback.impactOccurred('light');
    onClose();
  };

  const handleReset = () => {
    setLocalMinPrice(0);
    setLocalMaxPrice(10000);
    setLocalCurrency(null);
    setLocalSelectedCategory(null);
    setLocalSelectedSubcategory(null);
    setLocalCondition(null);
    onPriceRangeChange(null, null);
    onToggleFreeOnly(false);
    onSelect('newest');
    if (onCategoryChange) onCategoryChange(null, null);
    if (onConditionChange) onConditionChange(null);
    if (onCurrencyChange) onCurrencyChange(null as any);
    tg?.HapticFeedback.impactOccurred('light');
  };

  const handleCategorySelect = (categoryId: string) => {
    if (localSelectedCategory === categoryId) {
      setLocalSelectedCategory(null);
      setLocalSelectedSubcategory(null);
      if (onCategoryChange) onCategoryChange(null, null);
    } else {
      setLocalSelectedCategory(categoryId);
      setLocalSelectedSubcategory(null);
      if (onCategoryChange) onCategoryChange(categoryId, null);
    }
    tg?.HapticFeedback.impactOccurred('light');
    onClose();
  };

  const handleSubcategorySelect = (subcategoryId: string) => {
    setLocalSelectedSubcategory(subcategoryId);
    if (onCategoryChange && localSelectedCategory) {
      onCategoryChange(localSelectedCategory, subcategoryId);
    }
    tg?.HapticFeedback.impactOccurred('light');
    onClose();
  };

  const handleConditionSelect = (condition: ConditionOption) => {
    setLocalCondition(condition);
    if (onConditionChange) onConditionChange(condition);
    tg?.HapticFeedback.impactOccurred('light');
    onClose();
  };

  const handleCurrencySelect = (currency: Currency | null) => {
    setLocalCurrency(currency);
    if (onCurrencyChange) onCurrencyChange(currency);
    tg?.HapticFeedback.impactOccurred('light');
    onClose();
  };

  if (!isOpen) return null;

  // Перевіряємо реальні застосовані фільтри
  const hasActiveFilters = 
    currentSort !== 'newest' || 
    showFreeOnly || 
    (minPrice !== null && minPrice !== 0) || 
    (maxPrice !== null && maxPrice !== 10000) || 
    selectedCategory !== null || 
    selectedSubcategory !== null || 
    selectedCondition !== null || 
    selectedCurrency !== null;

  // Дебаг лог
  if (isOpen) {
    console.log('SortModal filters:', {
      currentSort,
      showFreeOnly,
      minPrice,
      maxPrice,
      selectedCategory,
      selectedSubcategory,
      selectedCondition,
      selectedCurrency,
      hasActiveFilters
    });
  }

  return (
    <Fragment>
      <style>{sliderStyles}</style>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
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
          <div className="flex-1 overflow-y-auto pb-24" style={{ paddingBottom: '100px' }}>
            <div className="p-6 space-y-6">
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
                          tg?.HapticFeedback.impactOccurred('light');
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
                  <button
                    onClick={() => handleCurrencySelect(null)}
                    className={`flex-1 px-4 py-3 rounded-xl transition-all ${
                      localCurrency === null
                        ? 'bg-blue-500 text-white font-medium'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {t('common.all')}
                  </button>
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
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs text-gray-500">{t('bazaar.minPrice')}</label>
                      <span className="text-sm font-semibold text-gray-900">{localMinPrice} {localCurrency ? getCurrencySymbol(localCurrency) : '€'}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10000"
                      step="100"
                      value={localMinPrice}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setLocalMinPrice(value);
                        if (value > localMaxPrice) {
                          setLocalMaxPrice(value);
                        }
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(localMinPrice / 10000) * 100}%, #e5e7eb ${(localMinPrice / 10000) * 100}%, #e5e7eb 100%)`
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
                      max="10000"
                      step="100"
                      value={localMaxPrice}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setLocalMaxPrice(value);
                        if (value < localMinPrice) {
                          setLocalMinPrice(value);
                        }
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${(localMaxPrice / 10000) * 100}%, #3b82f6 ${(localMaxPrice / 10000) * 100}%, #3b82f6 100%)`
                      }}
                    />
                  </div>
                </div>
                
                <button
                  onClick={handleApplyPriceRange}
                  className="w-full mt-3 px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
                >
                  {t('common.apply')}
                </button>
              </div>

              {/* Безкоштовні */}
              <div>
                <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={showFreeOnly}
                    onChange={(e) => {
                      onToggleFreeOnly(e.target.checked);
                      tg?.HapticFeedback.impactOccurred('light');
                      onClose();
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-900 font-medium">{t('bazaar.freeOnly')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Закріплені кнопки дій */}
          <div className="flex gap-3 p-6 border-t border-gray-200 flex-shrink-0">
            {hasActiveFilters ? (
              <>
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  {t('bazaar.reset')}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
                >
                  {t('common.close')}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
              >
                {t('common.close')}
              </button>
            )}
          </div>
        </div>
      </div>
    </Fragment>
  );
};
