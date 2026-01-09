import { Search, X, Gift, Clock, MapPin, SlidersHorizontal } from 'lucide-react';
import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '../CategoryChip';
import { ListingCard } from '../ListingCard';
import { SortModal } from '../SortModal';
import { CityModal } from '../CityModal';
import { SubcategoryList } from '../SubcategoryList';
import { TopBar } from '../TopBar';
import { ListingGridSkeleton } from '../SkeletonLoader';
import { getSearchHistory, addToSearchHistory } from '@/utils/searchHistory';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { Currency } from '@/utils/currency';

interface BazaarTabProps {
  categories: Category[];
  listings: Listing[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favorites: Set<number>;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  onCreateListing?: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onNavigateToCategories?: () => void;
  onOpenCategoriesModal?: () => void;
  initialSelectedCategory?: string | null;
  savedState?: {
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    selectedCities: string[];
    minPrice: number | null;
    maxPrice: number | null;
    selectedCondition: 'new' | 'used' | null;
    selectedCurrency: string | null;
    sortBy: 'newest' | 'price_low' | 'price_high' | 'popular';
    showFreeOnly: boolean;
  };
  onStateChange?: (state: {
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    selectedCities: string[];
    minPrice: number | null;
    maxPrice: number | null;
    selectedCondition: 'new' | 'used' | null;
    selectedCurrency: string | null;
    sortBy: 'newest' | 'price_low' | 'price_high' | 'popular';
    showFreeOnly: boolean;
  }) => void;
  tg: TelegramWebApp | null;
}

type SortOption = 'newest' | 'price_low' | 'price_high' | 'popular';

const BazaarTabComponent = ({
  categories,
  listings,
  searchQuery,
  onSearchChange,
  favorites,
  onSelectListing,
  onToggleFavorite,
  onCreateListing,
  hasMore = false,
  onLoadMore,
  onNavigateToCategories,
  onOpenCategoriesModal,
  initialSelectedCategory,
  savedState,
  onStateChange,
  tg
}: BazaarTabProps) => {
  const { t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    if (savedState?.selectedCategory !== undefined) {
      return savedState.selectedCategory;
    }
    if (initialSelectedCategory !== undefined) {
      return initialSelectedCategory;
    }
    // Fallback до localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
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
  
  // Синхронізуємо selectedCategory з initialSelectedCategory (тільки якщо немає збереженого стану)
  useEffect(() => {
    if (initialSelectedCategory !== undefined && initialSelectedCategory !== null) {
      // Перевіряємо, чи є збережений стан в localStorage або savedState
      const hasSavedCategory = savedState?.selectedCategory || 
        (typeof window !== 'undefined' && (() => {
          const saved = localStorage.getItem('bazaarTabState');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              return parsed.selectedCategory;
            } catch (e) {
              // ignore
            }
          }
          return null;
        })());
      
      // Якщо є збережена категорія, не перезаписуємо її initialSelectedCategory
      if (hasSavedCategory) {
        return;
      }
      
      // Оновлюємо тільки якщо немає збереженого стану
      if (initialSelectedCategory !== selectedCategory) {
      setSelectedCategory(initialSelectedCategory);
      }
    }
  }, [initialSelectedCategory]);
  
  // Синхронізуємо локальний стан з savedState при монтуванні та при зміні
  useEffect(() => {
    if (savedState) {
      // Оновлюємо стан тільки якщо він справді змінився
      if (savedState.selectedCategory !== selectedCategory && savedState.selectedCategory !== undefined) {
        setSelectedCategory(savedState.selectedCategory);
      }
      if (savedState.selectedSubcategory !== selectedSubcategory && savedState.selectedSubcategory !== undefined) {
        setSelectedSubcategory(savedState.selectedSubcategory);
      }
      if (savedState.showFreeOnly !== showFreeOnly && savedState.showFreeOnly !== undefined) {
        setShowFreeOnly(savedState.showFreeOnly);
      }
      if (savedState.sortBy !== sortBy && savedState.sortBy !== undefined) {
        setSortBy(savedState.sortBy);
      }
      if (savedState.selectedCities && JSON.stringify(savedState.selectedCities) !== JSON.stringify(selectedCities)) {
        setSelectedCities(savedState.selectedCities);
      }
      if (savedState.minPrice !== minPrice && savedState.minPrice !== undefined) {
        setMinPrice(savedState.minPrice);
      }
      if (savedState.maxPrice !== maxPrice && savedState.maxPrice !== undefined) {
        setMaxPrice(savedState.maxPrice);
      }
      if (savedState.selectedCondition !== selectedCondition && savedState.selectedCondition !== undefined) {
        setSelectedCondition(savedState.selectedCondition);
      }
      if (savedState.selectedCurrency !== selectedCurrency && savedState.selectedCurrency !== undefined) {
        setSelectedCurrency(savedState.selectedCurrency as Currency | null);
      }
    }
  }, [savedState?.selectedCategory, savedState?.selectedSubcategory, savedState?.showFreeOnly, savedState?.sortBy, savedState?.selectedCities, savedState?.minPrice, savedState?.maxPrice, savedState?.selectedCondition, savedState?.selectedCurrency]);
  
  // Додаткова синхронізація при монтуванні компонента (якщо savedState є)
  useEffect(() => {
    if (savedState && savedState.selectedCategory !== undefined) {
      // При монтуванні синхронізуємо стан з savedState
      setSelectedCategory(savedState.selectedCategory);
      setSelectedSubcategory(savedState.selectedSubcategory);
      setShowFreeOnly(savedState.showFreeOnly);
      setSortBy(savedState.sortBy);
      setSelectedCities(savedState.selectedCities || []);
      setMinPrice(savedState.minPrice);
      setMaxPrice(savedState.maxPrice);
      setSelectedCondition(savedState.selectedCondition);
      setSelectedCurrency(savedState.selectedCurrency as Currency | null);
    }
  }, []); // Виконується тільки при монтуванні
  
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() => {
    if (savedState?.selectedSubcategory !== undefined) {
      return savedState.selectedSubcategory;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
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
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
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
  
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    if (savedState?.sortBy !== undefined) {
      return savedState.sortBy;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.sortBy || 'newest';
        } catch (e) {
          // ignore
        }
      }
    }
    return 'newest';
  });
  const [showSortModal, setShowSortModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Listing[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [selectedCities, setSelectedCities] = useState<string[]>(() => {
    if (savedState?.selectedCities !== undefined) {
      return savedState.selectedCities;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.selectedCities || [];
        } catch (e) {
          // ignore
        }
      }
    }
    return [];
  });
  
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  
  const [minPrice, setMinPrice] = useState<number | null>(() => {
    if (savedState?.minPrice !== undefined) {
      return savedState.minPrice;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.minPrice || null;
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });
  
  const [maxPrice, setMaxPrice] = useState<number | null>(() => {
    if (savedState?.maxPrice !== undefined) {
      return savedState.maxPrice;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.maxPrice || null;
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });
  
  const [selectedCondition, setSelectedCondition] = useState<'new' | 'used' | null>(() => {
    if (savedState?.selectedCondition !== undefined) {
      return savedState.selectedCondition;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.selectedCondition || null;
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });
  
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(() => {
    if (savedState?.selectedCurrency !== undefined) {
      return savedState.selectedCurrency as Currency | null;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarTabState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.selectedCurrency || null;
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });
  
  
  // Зберігаємо стан при зміні
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        selectedCategory,
        selectedSubcategory,
        selectedCities,
        minPrice,
        maxPrice,
        selectedCondition,
        selectedCurrency,
        sortBy,
        showFreeOnly,
      });
    }
  }, [selectedCategory, selectedSubcategory, selectedCities, minPrice, maxPrice, selectedCondition, selectedCurrency, sortBy, showFreeOnly, onStateChange]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Завантажуємо історію пошуку
  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  // Завантажуємо рекомендації на основі переглянутих товарів
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const tg = (window as any).Telegram?.WebApp;
        const telegramId = tg?.initDataUnsafe?.user?.id;
        if (telegramId) {
          const response = await fetch(`/api/listings/recommendations?telegramId=${telegramId}&limit=8`);
          if (response.ok) {
            const data = await response.json();
            setRecommendations(data.listings || []);
            setShowRecommendations((data.listings || []).length > 0);
          }
        }
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      }
    };

    fetchRecommendations();
  }, []);

  const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);

  // Генеруємо підказки для автодоповнення (тільки назви товарів)
  const searchSuggestions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    // Якщо немає запиту, показуємо історію пошуку
    if (!query) {
      return searchHistory.slice(0, 5);
    }
    
    if (query.length < 2) return [];
    
    const suggestionsSet = new Set<string>();
    
    // Додаємо тільки назви товарів, які містять запит
    listings.forEach(listing => {
      const title = listing.title.toLowerCase();
      if (title.includes(query)) {
        suggestionsSet.add(listing.title);
      }
    });
    
    return Array.from(suggestionsSet).slice(0, 5);
  }, [searchQuery, listings, searchHistory]);

  // Закриваємо підказки при кліку поза ними
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAndSortedListings = useMemo(() => {
    let filtered = listings;

    // Фільтр по категорії (не застосовуємо при пошуку)
    if (selectedCategory && !searchQuery.trim()) {
      filtered = filtered.filter(listing => listing.category === selectedCategory);
    }

    // Фільтр по підкатегорії (не застосовуємо при пошуку)
    if (selectedSubcategory && !searchQuery.trim()) {
      filtered = filtered.filter(listing => listing.subcategory === selectedSubcategory);
    }

    // Фільтр безкоштовних
    if (showFreeOnly) {
      filtered = filtered.filter(listing => listing.isFree || listing.price.toLowerCase().includes('безкоштовно'));
    }

    // Фільтр по містам (множинний вибір)
    if (selectedCities.length > 0) {
      filtered = filtered.filter(listing => 
        selectedCities.some(city => 
          listing.location.toLowerCase().includes(city.toLowerCase())
        )
      );
    }

    // Фільтр по стану товару
    if (selectedCondition) {
      filtered = filtered.filter(listing => listing.condition === selectedCondition);
    }

    // Фільтр по валюті (тільки якщо вибрано конкретну валюту)
    if (selectedCurrency) {
      filtered = filtered.filter(listing => listing.currency === selectedCurrency);
    }

    // Фільтр по діапазону цін
    if (minPrice !== null || maxPrice !== null) {
      filtered = filtered.filter(listing => {
        if (listing.isFree || listing.price.toLowerCase().includes('безкоштовно')) {
          return minPrice === null || minPrice === 0; // Безкоштовні показуємо тільки якщо мін. ціна = 0
        }
        const price = parseInt(listing.price.replace(/\s/g, '').replace('₴', '').replace('€', '').replace('$', '')) || 0;
        if (minPrice !== null && price < minPrice) return false;
        if (maxPrice !== null && price > maxPrice) return false;
        return true;
      });
    }

    // Фільтр по пошуку (по назві, опису, бренду та ключовим словам)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(listing => 
        listing.title.toLowerCase().includes(query) ||
        listing.description.toLowerCase().includes(query) ||
        listing.location.toLowerCase().includes(query)
      );
    }

    // Сортування
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price_low': {
          if (a.isFree || a.price.toLowerCase().includes('безкоштовно')) return -1;
          if (b.isFree || b.price.toLowerCase().includes('безкоштовно')) return 1;
          const priceA = parseInt(a.price.replace(/\s/g, '').replace('₴', '').replace('€', '')) || 0;
          const priceB = parseInt(b.price.replace(/\s/g, '').replace('₴', '').replace('€', '')) || 0;
          return priceA - priceB;
        }
        case 'price_high': {
          if (a.isFree || a.price.toLowerCase().includes('безкоштовно')) return 1;
          if (b.isFree || b.price.toLowerCase().includes('безкоштовно')) return -1;
          const priceA = parseInt(a.price.replace(/\s/g, '').replace('₴', '').replace('€', '')) || 0;
          const priceB = parseInt(b.price.replace(/\s/g, '').replace('₴', '').replace('€', '')) || 0;
          return priceB - priceA;
        }
        case 'popular':
          return b.views - a.views;
        default:
          return 0;
      }
    });

    return sorted;
  }, [listings, selectedCategory, selectedSubcategory, showFreeOnly, searchQuery, sortBy, selectedCities, minPrice, maxPrice, selectedCondition, selectedCurrency]);

  const getSortLabel = () => {
    switch (sortBy) {
      case 'newest': return t('bazaar.sort.newest');
      case 'price_low': return t('bazaar.sort.priceLow');
      case 'price_high': return t('bazaar.sort.priceHigh');
      case 'popular': return t('bazaar.sort.popular');
    }
  };


  const hasActiveFilters = !!(sortBy !== 'newest' || showFreeOnly || minPrice !== null || maxPrice !== null || selectedCategory || selectedSubcategory || selectedCities.length > 0 || selectedCondition !== null || selectedCurrency !== null);

  return (
    <div className="pb-24">
      {/* Пошук з TopBar */}
      <div className="relative">
        <div className="p-4 bg-white sticky top-0 z-20 border-b border-gray-100">
          <div className="flex gap-1 items-center" ref={suggestionsRef}>
            <TopBar
              variant="main"
              onSearchChange={(query) => {
                onSearchChange(query);
                setShowSuggestions(true);
              }}
              onSearchSubmit={(query) => {
                // Обробка натискання Enter/Search
                onSearchChange(query);
                setShowSuggestions(false);
                addToSearchHistory(query);
                setSearchHistory(getSearchHistory());
                searchInputRef.current?.blur();
              }}
              onFilterClick={() => {
                setShowSortModal(true);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              onSearchClear={() => {
                onSearchChange('');
                setShowSuggestions(false);
              }}
              searchQuery={searchQuery}
              searchPlaceholder={selectedCities.length > 0 ? t('bazaar.searchInCity', { city: selectedCities[0] }) : t('bazaar.whatInterestsYou')}
              searchInputRef={searchInputRef}
              hasActiveFilters={hasActiveFilters}
              tg={tg}
            />
            
            {/* Підказки автодоповнення */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute left-4 right-4 mt-2 bg-white rounded-xl border border-gray-200 shadow-lg z-30 max-h-60 overflow-y-auto">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      // При кліку на підказку виконуємо пошук
                      onSearchChange(suggestion);
                      addToSearchHistory(suggestion);
                      setSearchHistory(getSearchHistory());
                      setShowSuggestions(false);
                      searchInputRef.current?.blur();
                      tg?.HapticFeedback.impactOccurred('light');
                      // Після вибору підказки виконуємо пошук (сторінка оновлюється автоматично через onSearchChange)
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-900 border-b border-gray-100 last:border-b-0"
                  >
                    {!searchQuery.trim() ? (
                      <Clock size={16} className="text-gray-400" />
                    ) : (
                      <Search size={16} className="text-gray-400" />
                    )}
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Кнопка вибору міста */}
            <button
              onClick={() => setIsCityModalOpen(true)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors relative ${
                selectedCities.length > 0
                  ? 'bg-green-50 border-2 border-green-500'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <MapPin size={18} className="text-gray-900" />
              {selectedCities.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {selectedCities.length > 9 ? '9+' : selectedCities.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>



      {/* Розділи - показуємо тільки якщо не вибрана категорія та немає пошуку */}
      {categories.length > 0 && !selectedCategory && !searchQuery.trim() && (
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('navigation.categories')}</h2>
          </div>
          <div 
            className="overflow-x-auto -mx-4 px-4 w-full scrollbar-hide" 
            style={{ 
              maxWidth: '100vw',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
              {/* Кнопка "Всі категорії" */}
              <div 
                className="flex flex-col items-center min-w-[80px] max-w-[90px] cursor-pointer flex-shrink-0"
                onClick={() => {
                  if (onOpenCategoriesModal) {
                    onOpenCategoriesModal();
                    tg?.HapticFeedback.impactOccurred('light');
                  } else if (onNavigateToCategories) {
                    onNavigateToCategories();
                    tg?.HapticFeedback.impactOccurred('light');
                  } else {
                    setSelectedCategory(null);
                    setSelectedSubcategory(null);
                    tg?.HapticFeedback.impactOccurred('light');
                  }
                }}
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl mb-1.5 transition-all bg-blue-500 text-white">
                  📦
                </div>
                <span className="text-xs font-medium text-center whitespace-normal leading-tight px-0.5 text-blue-600">
                  {t('bazaar.allCategories')}
                </span>
              </div>
              
              {categories.map(category => (
                <CategoryChip 
                  key={category.id} 
                  category={category}
                  isActive={false}
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setSelectedSubcategory(null);
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Кнопка очищення фільтрів, коли вибрана категорія */}
      {(selectedCategory || selectedSubcategory) && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedCategoryData?.name || t('navigation.categories')}
            </h2>
            <button
              onClick={() => {
                setSelectedCategory(null);
                setSelectedSubcategory(null);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="text-sm text-blue-600 font-medium hover:text-blue-700"
            >
              {t('common.clear')}
            </button>
          </div>
        </div>
      )}

      {/* Типи */}
      {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
        <SubcategoryList
          subcategories={selectedCategoryData.subcategories}
          selectedSubcategory={selectedSubcategory}
          onSelect={(subcategoryId) => {
            setSelectedSubcategory(subcategoryId);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          tg={tg}
        />
      )}

      {/* Сітка оголошень */}
      {filteredAndSortedListings.length > 0 ? (
        <>
          <div className="px-4 grid grid-cols-2 gap-3 pb-4">
            {filteredAndSortedListings.map(listing => (
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
          
          {/* Кнопка "Показати ще" - після списку товарів, перед нижнім меню */}
          {hasMore && filteredAndSortedListings.length > 0 && (
            <div className="px-4 py-4 pb-24 text-center">
              {onLoadMore && (
                <button
                  onClick={() => {
                    onLoadMore();
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="text-blue-600 text-sm font-medium hover:text-blue-700"
                >
                  {t('common.showMore')}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="px-4 py-16 text-center">
          <p className="text-gray-500">{t('common.nothingFound')}</p>
          {(searchQuery || selectedCategory || selectedSubcategory || showFreeOnly) && (
            <button
              onClick={() => {
                onSearchChange('');
                setSelectedCategory(null);
                setSelectedSubcategory(null);
                setShowFreeOnly(false);
              }}
              className="mt-4 text-blue-600 text-sm font-medium"
            >
              {t('bazaar.clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* Модальне вікно сортування та фільтрів */}
      <SortModal
        isOpen={showSortModal}
        currentSort={sortBy}
        showFreeOnly={showFreeOnly}
        minPrice={minPrice}
        maxPrice={maxPrice}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
        selectedCondition={selectedCondition}
        selectedCurrency={selectedCurrency}
        onClose={() => setShowSortModal(false)}
        onSelect={(sort) => setSortBy(sort)}
        onToggleFreeOnly={(value) => setShowFreeOnly(value)}
        onPriceRangeChange={(min, max) => {
          setMinPrice(min);
          setMaxPrice(max);
        }}
        onCategoryChange={(categoryId, subcategoryId) => {
          setSelectedCategory(categoryId);
          setSelectedSubcategory(subcategoryId);
        }}
        onConditionChange={(condition) => {
          setSelectedCondition(condition);
        }}
        onCurrencyChange={(currency) => {
          setSelectedCurrency(currency);
        }}
        tg={tg}
      />

      {/* Модальне вікно вибору міста */}
      <CityModal
        isOpen={isCityModalOpen}
        selectedCities={selectedCities}
        onClose={() => setIsCityModalOpen(false)}
        onSelect={(cities) => setSelectedCities(cities)}
        tg={tg}
      />
    </div>
  );
};

// Мемоізуємо компонент для запобігання непотрібних перерендерів
export const BazaarTab = memo(BazaarTabComponent, (prevProps, nextProps) => {
  // Перевіряємо, чи змінилися критичні пропси
  return (
    prevProps.listings === nextProps.listings &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.favorites === nextProps.favorites &&
    prevProps.categories === nextProps.categories &&
    prevProps.savedState?.selectedCategory === nextProps.savedState?.selectedCategory &&
    prevProps.savedState?.selectedSubcategory === nextProps.savedState?.selectedSubcategory &&
    prevProps.savedState?.selectedCities === nextProps.savedState?.selectedCities &&
    prevProps.savedState?.minPrice === nextProps.savedState?.minPrice &&
    prevProps.savedState?.maxPrice === nextProps.savedState?.maxPrice &&
    prevProps.savedState?.selectedCondition === nextProps.savedState?.selectedCondition &&
    prevProps.savedState?.selectedCurrency === nextProps.savedState?.selectedCurrency &&
    prevProps.savedState?.sortBy === nextProps.savedState?.sortBy &&
    prevProps.savedState?.showFreeOnly === nextProps.savedState?.showFreeOnly &&
    prevProps.initialSelectedCategory === nextProps.initialSelectedCategory
  );
});

