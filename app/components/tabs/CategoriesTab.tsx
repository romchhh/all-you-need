import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '../CategoryChip';
import { SubcategoryList } from '../SubcategoryList';
import { ListingCard } from '../ListingCard';
import { CategoryIcon } from '../CategoryIcon';
import { STICKY_BELOW_APP_HEADER_CLASS } from '../FixedLogoHeader';
import { useState, useMemo, useEffect } from 'react';
import { Gift, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

interface CategoriesTabProps {
  categories: Category[];
  listings: Listing[];
  favorites: Set<number>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
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
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSelectListing,
  onToggleFavorite,
  savedState,
  onStateChange,
  tg
}: CategoriesTabProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  // Ініціалізуємо стан з savedState або з localStorage як fallback
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    if (savedState?.selectedCategory !== undefined) {
      return savedState.selectedCategory;
    }
    // Fallback до localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('categoriesTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.selectedCategory || null;
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });
  
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() => {
    if (savedState?.selectedSubcategory !== undefined) {
      return savedState.selectedSubcategory;
    }
    // Fallback до localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('categoriesTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.selectedSubcategory || null;
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });
  
  const [showFreeOnly, setShowFreeOnly] = useState<boolean>(() => {
    if (savedState?.showFreeOnly !== undefined) {
      return savedState.showFreeOnly;
    }
    // Fallback до localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('categoriesTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.showFreeOnly || false;
        } catch (e) {
          // ignore
        }
      }
    }
    return false;
  });
  
  // Синхронізуємо локальний стан з savedState при його зміні
  useEffect(() => {
    if (savedState) {
      // Оновлюємо стан тільки якщо він справді змінився, щоб уникнути нескінченних циклів
      if (savedState.selectedCategory !== selectedCategory) {
        setSelectedCategory(savedState.selectedCategory);
      }
      if (savedState.selectedSubcategory !== selectedSubcategory) {
        setSelectedSubcategory(savedState.selectedSubcategory);
      }
      if (savedState.showFreeOnly !== showFreeOnly) {
        setShowFreeOnly(savedState.showFreeOnly);
      }
    }
  }, [savedState?.selectedCategory, savedState?.selectedSubcategory, savedState?.showFreeOnly]);
  
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
    <div className="mx-auto w-full max-w-2xl pb-24 lg:max-w-4xl xl:max-w-5xl">
      {/* Заголовок */}
      <div
        className={`${STICKY_BELOW_APP_HEADER_CLASS} border-b px-4 pb-3 pt-2 lg:px-6 ${
          isLight
            ? 'border-gray-200/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75'
            : 'border-gray-800/50 bg-black/30 backdrop-blur-md'
        }`}
      >
        <h1 className={`text-2xl font-bold ${ac.pageHeading}`}>{t('common.sections')}</h1>
      </div>

      {/* Кнопка безкоштовних товарів */}
      <div className={`border-b px-4 py-3 lg:px-6 ${isLight ? 'border-gray-200' : 'border-gray-800/50'}`}>
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
          className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl transition-colors border ${
            selectedCategory === 'free'
              ? isLight
                ? 'bg-green-500/20 text-[#3F5331] border-[#3F5331]'
                : 'bg-[#C8E6A0]/12 text-[#C8E6A0] border-[#C8E6A0]/70'
              : isLight
                ? 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-50'
                : 'bg-gray-800/50 text-gray-300 border-transparent hover:bg-gray-700/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Gift size={20} />
            <span className="font-medium">{t('categories.free')}</span>
          </div>
        </button>
        
        {/* Кнопка очищення для категорії "Безкоштовно" */}
        {(selectedCategory === 'free' || showFreeOnly) && (
          <div className="mt-3">
            <button
              onClick={() => {
                setSelectedCategory(null);
                setShowFreeOnly(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full ${ac.outlineButton}`}
            >
              {t('common.clear')}
            </button>
          </div>
        )}
      </div>

      {/* Розділи */}
      <div className="px-4 pb-3 pt-2 lg:px-6">
        <h2 className={`mb-3 text-lg font-semibold ${ac.pageHeading}`}>{t('categories.allSections')}</h2>
        <div className="mx-auto grid w-full grid-cols-2 gap-3 lg:max-w-3xl xl:max-w-4xl">
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
              className={`p-4 rounded-2xl transition-all text-left relative overflow-hidden ${
                selectedCategory === category.id
                  ? isLight
                    ? 'border-2 border-[#3F5331]'
                    : 'border border-[#C8E6A0] shadow-[0_0_14px_rgba(200,230,160,0.18)]'
                  : isLight
                    ? 'border border-gray-200 hover:border-gray-300'
                    : 'border border-white hover:border-white/80'
              }`}
              style={{
                background: isLight
                  ? selectedCategory === category.id
                    ? 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(63, 83, 49, 0.25) 0%, transparent 45%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(63, 83, 49, 0.18) 0%, transparent 45%), #ffffff'
                    : 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(63, 83, 49, 0.18) 0%, transparent 45%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(63, 83, 49, 0.14) 0%, transparent 45%), #ffffff'
                  : selectedCategory === category.id
                    ? 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(200, 230, 160, 0.34) 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(200, 230, 160, 0.22) 0%, transparent 40%), #000000'
                    : 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(200, 230, 160, 0.14) 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(200, 230, 160, 0.10) 0%, transparent 40%), #000000',
              }}
            >
              <div className="mb-2">
                <CategoryIcon categoryId={category.id} isActive={selectedCategory === category.id} size={32} />
              </div>
              <div
                className={`font-semibold text-sm ${
                  selectedCategory === category.id
                    ? isLight
                      ? 'text-[#3F5331]'
                      : 'text-[#C8E6A0]'
                    : isLight
                      ? 'text-gray-800'
                      : 'text-white'
                }`}
              >
                {category.name}
              </div>
            </button>
          ))}
        </div>
      </div>


      {/* Типи */}
      {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
        <div className={`border-t px-4 pb-3 pt-2 lg:px-6 ${isLight ? 'border-gray-200' : 'border-gray-800/50'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-base font-semibold ${ac.pageHeading}`}>{t('categories.subcategories') || 'Підкатегорії'}</h3>
            <button
              onClick={() => {
                setSelectedCategory(null);
                setSelectedSubcategory(null);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={ac.outlineButton}
            >
              {t('common.clear')}
            </button>
          </div>
          <SubcategoryList
            subcategories={selectedCategoryData.subcategories}
            selectedSubcategory={selectedSubcategory}
            onSelect={(subcategoryId) => {
              setSelectedSubcategory(subcategoryId);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            tg={tg}
            categoryId={selectedCategory}
          />
        </div>
      )}

      {/* Оголошення */}
      {filteredListings.length > 0 && (
        <>
          <div className="mx-auto grid w-full max-w-[1680px] grid-cols-2 gap-3 px-4 pb-4 pt-4 lg:grid-cols-3 lg:px-6">
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
          {hasMore && listings.length > 0 && onLoadMore && (
            <div className="px-4 py-4 text-center lg:px-6">
              {loadingMore ? (
                <div className="text-gray-400 text-sm">{t('common.loading')}</div>
              ) : (
                <button
                  onClick={() => {
                    onLoadMore();
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={ac.outlineButton}
                >
                  {t('common.showMore')}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {filteredListings.length === 0 && (selectedCategory || selectedSubcategory || showFreeOnly) && (
        <div className="px-4 py-16 text-center lg:px-6">
          <p className={ac.nothingFound}>{t('common.nothingFound')}</p>
          <button
            onClick={() => {
              setSelectedCategory(null);
              setSelectedSubcategory(null);
              setShowFreeOnly(false);
            }}
            className={`mt-4 ${ac.outlineButton}`}
          >
            Очистити фільтри
          </button>
        </div>
      )}
    </div>
  );
};

