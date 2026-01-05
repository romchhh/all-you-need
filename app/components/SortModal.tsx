'use client';

import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, Fragment } from 'react';

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

interface SortModalProps {
  isOpen: boolean;
  currentSort: SortOption;
  showFreeOnly: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  onClose: () => void;
  onSelect: (sort: SortOption) => void;
  onToggleFreeOnly: (value: boolean) => void;
  onPriceRangeChange: (min: number | null, max: number | null) => void;
  tg: TelegramWebApp | null;
}

export const SortModal = ({ 
  isOpen, 
  currentSort, 
  showFreeOnly,
  minPrice,
  maxPrice,
  onClose, 
  onSelect, 
  onToggleFreeOnly,
  onPriceRangeChange,
  tg 
}: SortModalProps) => {
  const { t } = useLanguage();
  const [localMinPrice, setLocalMinPrice] = useState<number>(minPrice || 0);
  const [localMaxPrice, setLocalMaxPrice] = useState<number>(maxPrice || 10000);

  useEffect(() => {
    if (isOpen) {
      setLocalMinPrice(minPrice || 0);
      setLocalMaxPrice(maxPrice || 10000);
    }
  }, [isOpen, minPrice, maxPrice]);

  const sortOptions: { value: SortOption; labelKey: string }[] = [
    { value: 'newest', labelKey: 'bazaar.sort.newest' },
    { value: 'price_low', labelKey: 'bazaar.sort.priceLow' },
    { value: 'price_high', labelKey: 'bazaar.sort.priceHigh' },
    { value: 'popular', labelKey: 'bazaar.sort.popular' }
  ];

  const handleApplyPriceRange = () => {
    const min = localMinPrice > 0 ? localMinPrice : null;
    const max = localMaxPrice < 10000 ? localMaxPrice : null;
    onPriceRangeChange(min, max);
    tg?.HapticFeedback.impactOccurred('light');
  };

  const handleClearFilters = () => {
    setLocalMinPrice(0);
    setLocalMaxPrice(10000);
    onPriceRangeChange(null, null);
    onToggleFreeOnly(false);
    onSelect('newest');
    tg?.HapticFeedback.impactOccurred('light');
  };

  if (!isOpen) return null;

  const hasActiveFilters = currentSort !== 'newest' || showFreeOnly || minPrice !== null || maxPrice !== null;

  return (
    <Fragment>
      <style>{sliderStyles}</style>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
        <div 
          className="w-full bg-white rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">{t('common.sort')}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X size={18} className="text-gray-900" />
          </button>
        </div>

        {/* Сортування */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('common.sort')}</h4>
          <div className="space-y-2">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSelect(option.value);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full text-left p-4 rounded-xl transition-all ${
                  currentSort === option.value
                    ? 'bg-blue-50 text-blue-600 font-medium border-2 border-blue-500'
                    : 'bg-gray-50 text-gray-900 hover:bg-gray-100'
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Діапазон цін */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('bazaar.priceRange')}</h4>
          
          {/* Повзунки */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-gray-500">{t('bazaar.minPrice')}</label>
                <span className="text-sm font-semibold text-gray-900">{localMinPrice} ₴</span>
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
                <span className="text-sm font-semibold text-gray-900">{localMaxPrice} ₴</span>
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
          
          {/* Діапазон */}
          <div className="mt-4 p-3 bg-gray-50 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">{t('bazaar.from')}</span>
              <span className="text-lg font-bold text-gray-900">{localMinPrice} ₴</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-gray-600">{t('bazaar.to')}</span>
              <span className="text-lg font-bold text-gray-900">{localMaxPrice} ₴</span>
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
        <div className="mb-6">
          <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={showFreeOnly}
              onChange={(e) => {
                onToggleFreeOnly(e.target.checked);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-900 font-medium">{t('bazaar.freeOnly')}</span>
          </label>
        </div>

        {/* Кнопки дій */}
        <div className="flex gap-3">
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              {t('common.clear')}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
      </div>
    </Fragment>
  );
};

