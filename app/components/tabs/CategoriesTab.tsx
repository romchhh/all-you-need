import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '../CategoryChip';
import { SubcategoryList } from '../SubcategoryList';
import { ListingCard } from '../ListingCard';
import { useState, useMemo, useEffect } from 'react';
import { Gift } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface CategoriesTabProps {
  categories: Category[];
  listings: Listing[];
  favorites: Set<number>;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  savedState?: {
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    showFreeOnly: boolean;
  };
  onStateChange?: (state: {
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    showFreeOnly: boolean;
  }) => void;
  tg: TelegramWebApp | null;
}

export const CategoriesTab = ({
  categories,
  listings,
  favorites,
  onSelectListing,
  onToggleFavorite,
  savedState,
  onStateChange,
  tg
}: CategoriesTabProps) => {
  const { t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(savedState?.selectedCategory || null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(savedState?.selectedSubcategory || null);
  const [showFreeOnly, setShowFreeOnly] = useState<boolean>(savedState?.showFreeOnly || false);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  
  // Зберігаємо стан при зміні
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        selectedCategory,
        selectedSubcategory,
        showFreeOnly,
      });
    }
  }, [selectedCategory, selectedSubcategory, showFreeOnly, onStateChange]);

  const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);

  // Підраховуємо кількість товарів для кожної категорії
  useEffect(() => {
    const counts: Record<string, number> = {};
    
    // Підрахунок для безкоштовних товарів
    const freeCount = listings.filter(listing => listing.isFree || listing.price.toLowerCase().includes('безкоштовно')).length;
    counts['free'] = freeCount;
    
    // Підрахунок для кожної категорії
    categories.forEach(category => {
      const categoryListings = listings.filter(listing => listing.category === category.id);
      counts[category.id] = categoryListings.length;
    });
    
    setCategoryCounts(counts);
  }, [listings, categories]);

  // Додаємо категорію "Безкоштовні товари"
  const allCategories = [
    {
      id: 'free',
      name: t('categories.free'),
      icon: '🎁',
      subcategories: []
    },
    ...categories
  ];

  const filteredListings = useMemo(() => {
    let filtered = listings;

    // Фільтр безкоштовних товарів
    if (showFreeOnly || selectedCategory === 'free') {
      filtered = filtered.filter(listing => listing.isFree || listing.price.toLowerCase().includes('безкоштовно'));
    }

    // Фільтр по категорії
    if (selectedCategory && selectedCategory !== 'free') {
      filtered = filtered.filter(listing => listing.category === selectedCategory);
    }

    // Фільтр по підкатегорії
    if (selectedSubcategory) {
      filtered = filtered.filter(listing => listing.subcategory === selectedSubcategory);
    }

    return filtered;
  }, [listings, selectedCategory, selectedSubcategory, showFreeOnly]);

  return (
    <div className="pb-24">
      {/* Заголовок */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-gray-900">{t('common.sections')}</h1>
      </div>

      {/* Кнопка безкоштовних товарів */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <button
          onClick={() => {
            if (selectedCategory === 'free') {
              setSelectedCategory(null);
              setShowFreeOnly(false);
            } else {
              setSelectedCategory('free');
              setShowFreeOnly(true);
            }
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl transition-colors ${
            selectedCategory === 'free'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <Gift size={20} />
            <span className="font-medium">{t('categories.free')}</span>
          </div>
        </button>
      </div>

      {/* Розділи */}
      <div className="px-4 pt-4 pb-3 bg-white">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('categories.allSections')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {allCategories.map(category => (
            <button
              key={category.id}
              onClick={() => {
                if (selectedCategory === category.id) {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                } else {
                  setSelectedCategory(category.id);
                  setSelectedSubcategory(null);
                }
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`p-4 rounded-2xl border-2 transition-all text-left ${
                selectedCategory === category.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-3xl mb-2">{category.icon}</div>
              <div className="font-semibold text-gray-900 text-sm">{category.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Типи */}
      {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
        <div className="px-4 pt-4 pb-3 bg-white border-t border-gray-100">
          <SubcategoryList
            subcategories={selectedCategoryData.subcategories}
            selectedSubcategory={selectedSubcategory}
            onSelect={(subcategoryId) => {
              setSelectedSubcategory(subcategoryId);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            tg={tg}
          />
        </div>
      )}

      {/* Оголошення */}
      {filteredListings.length > 0 && (
        <>
          <div className="px-4 grid grid-cols-2 gap-3 pb-4 pt-4">
            {filteredListings.map(listing => (
              <ListingCard 
                key={listing.id} 
                listing={listing}
                isFavorite={favorites.has(listing.id)}
                onSelect={onSelectListing}
                onToggleFavorite={onToggleFavorite}
                tg={tg}
              />
            ))}
          </div>
        </>
      )}

      {filteredListings.length === 0 && (selectedCategory || selectedSubcategory || showFreeOnly) && (
        <div className="px-4 py-16 text-center">
          <p className="text-gray-500">{t('common.nothingFound')}</p>
          <button
            onClick={() => {
              setSelectedCategory(null);
              setSelectedSubcategory(null);
              setShowFreeOnly(false);
            }}
            className="mt-4 text-blue-600 text-sm font-medium"
          >
            Очистити фільтри
          </button>
        </div>
      )}
    </div>
  );
};

