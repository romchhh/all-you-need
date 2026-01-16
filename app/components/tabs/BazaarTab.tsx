import { Search, X, Gift, Clock, MapPin, SlidersHorizontal, Grid3x3, List } from 'lucide-react';
import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '../CategoryChip';
import { CategoryIcon } from '../CategoryIcon';
import { ListingCard } from '../ListingCard';
import { ListingCardColumn } from '../ListingCardColumn';
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
  deferredSearchQuery?: string;
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
    viewMode?: 'grid' | 'list';
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
    viewMode?: 'grid' | 'list';
  }) => void;
  tg: TelegramWebApp | null;
}

type SortOption = 'newest' | 'price_low' | 'price_high' | 'popular';

const BazaarTabComponent = ({
  categories,
  listings,
  searchQuery,
  deferredSearchQuery,
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
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bazaarViewMode');
      return (saved === 'list' || saved === 'grid') ? saved : 'grid';
    }
    return 'grid';
  });
  
  // Зберігаємо viewMode при зміні
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bazaarViewMode', viewMode);
    }
  }, [viewMode]);
  
  
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
    // Early return для порожнього списку
    if (listings.length === 0) return [];
    
    let filtered = listings;
    
    // Використовуємо deferredSearchQuery для фільтрації (якщо є), інакше searchQuery
    const queryToUse = deferredSearchQuery !== undefined ? deferredSearchQuery : searchQuery;
    
    // Оптимізація: кешуємо запит для пошуку
    const trimmedQuery = queryToUse.trim();
    const hasSearch = Boolean(trimmedQuery);
    const lowerQuery = hasSearch ? trimmedQuery.toLowerCase() : '';
    
    // Обмеження: при пошуку показуємо максимум 10 результатів для швидкості
    const MAX_SEARCH_RESULTS = 20;

    // Фільтр по пошуку (найважливіший фільтр - застосовуємо першим для швидшого відсіювання)
    if (hasSearch) {
      const searchResults: typeof filtered = [];
      
      // Обмежуємо пошук для швидкості - зупиняємось після знаходження MAX_SEARCH_RESULTS
      for (let i = 0; i < filtered.length && searchResults.length < MAX_SEARCH_RESULTS; i++) {
        const listing = filtered[i];
        const titleLower = listing.title.toLowerCase();
        const descLower = listing.description.toLowerCase();
        const locationLower = listing.location.toLowerCase();
        
        if (titleLower.includes(lowerQuery) || 
            descLower.includes(lowerQuery) || 
            locationLower.includes(lowerQuery)) {
          searchResults.push(listing);
        }
      }
      
      filtered = searchResults;
      
      // Якщо є пошук, не застосовуємо категорії (повертаємо всі результати пошуку)
      // Застосовуємо тільки інші фільтри
    } else {
      // Фільтр по категорії (тільки якщо немає пошуку)
      if (selectedCategory) {
        filtered = filtered.filter(listing => listing.category === selectedCategory);
      }

      // Фільтр по підкатегорії (тільки якщо немає пошуку)
      if (selectedSubcategory) {
        filtered = filtered.filter(listing => listing.subcategory === selectedSubcategory);
      }
    }

    // Фільтр безкоштовних (швидка перевірка)
    if (showFreeOnly) {
      filtered = filtered.filter(listing => listing.isFree);
    }

    // Фільтр по містам (оптимізовано)
    if (selectedCities.length > 0) {
      const lowerCities = selectedCities.map(c => c.toLowerCase());
      filtered = filtered.filter(listing => {
        const lowerLocation = listing.location.toLowerCase();
        return lowerCities.some(city => lowerLocation.includes(city));
      });
    }

    // Фільтр по стану товару (швидка перевірка)
    if (selectedCondition) {
      filtered = filtered.filter(listing => listing.condition === selectedCondition);
    }

    // Фільтр по валюті (швидка перевірка)
    if (selectedCurrency) {
      filtered = filtered.filter(listing => listing.currency === selectedCurrency);
    }

    // Фільтр по діапазону цін
    if (minPrice !== null || maxPrice !== null) {
      filtered = filtered.filter(listing => {
        if (listing.isFree) {
          return minPrice === null || minPrice === 0;
        }
        const price = parseInt(listing.price.replace(/\s/g, '').replace(/[₴€$]/g, '')) || 0;
        return (minPrice === null || price >= minPrice) && (maxPrice === null || price <= maxPrice);
      });
    }

    // Сортування (оптимізовано - не сортуємо якщо newest і немає ціни)
    if (sortBy === 'newest') {
      return filtered; // Не треба сортувати, оголошення вже відсортовані за датою
    }
    
    // Для сортувань по ціні - кешуємо ціни
    if (sortBy === 'price_low' || sortBy === 'price_high') {
      const withPrices = filtered.map(listing => ({
        listing,
        price: listing.isFree ? 0 : parseInt(listing.price.replace(/\D/g, '')) || 0,
        isFree: listing.isFree
      }));
      
      withPrices.sort((a, b) => {
        if (sortBy === 'price_low') {
          if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
          return a.price - b.price;
        } else {
          if (a.isFree !== b.isFree) return a.isFree ? 1 : -1;
          return b.price - a.price;
        }
      });
      
      return withPrices.map(item => item.listing);
    }
    
    // Сортування по популярності
    if (sortBy === 'popular') {
      return [...filtered].sort((a, b) => b.views - a.views);
    }

    return filtered;
  }, [listings, selectedCategory, selectedSubcategory, showFreeOnly, deferredSearchQuery, searchQuery, sortBy, selectedCities, minPrice, maxPrice, selectedCondition, selectedCurrency]);

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
        <div className="p-4 sticky top-0 z-20 border-b border-gray-800/50">
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
              <div className="absolute left-4 right-4 mt-2 bg-gray-900 rounded-xl border border-gray-700 shadow-lg z-30 max-h-60 overflow-y-auto">
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
                    className="w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors flex items-center gap-2 text-white border-b border-gray-700 last:border-b-0"
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
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors relative border ${
                selectedCities.length > 0
                  ? 'border-[#D3F1A7] bg-transparent'
                  : 'border-white bg-transparent hover:bg-white/10'
              }`}
            >
              <MapPin size={18} className="text-white" />
              {selectedCities.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#D3F1A7] text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {selectedCities.length > 9 ? '9+' : selectedCities.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>



      {/* Розділи - показуємо тільки якщо не вибрана категорія та немає пошуку */}
      {categories.length > 0 && !selectedCategory && !searchQuery.trim() && (
        <div className="pt-2 pb-3">
          <div className="flex items-center justify-between mb-3 px-4">
            <h2 className="text-lg font-semibold text-white">{t('navigation.categories')}</h2>
            {/* Перемикач виду */}
            {filteredAndSortedListings.length > 0 && (
              <div className="flex items-center gap-1 bg-gray-800/50 rounded-xl p-1">
                <button
                  onClick={() => {
                    setViewMode('grid');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#D3F1A7] text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Grid3x3 size={18} />
                </button>
                <button
                  onClick={() => {
                    setViewMode('list');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#D3F1A7] text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <List size={18} />
                </button>
              </div>
            )}
          </div>
          <div 
            className="overflow-x-auto scrollbar-hide" 
            style={{ 
              width: '100vw',
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
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-1.5 transition-all relative overflow-hidden border border-white"
                  style={{
                    background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
                  }}
                >
                  <CategoryIcon categoryId="all_categories" isActive={false} size={32} />
                </div>
                <span className="text-xs font-medium text-center whitespace-normal leading-tight px-0.5 text-white">
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
              {/* Невеликий відступ справа для останнього елемента */}
              <div className="flex-shrink-0 w-2" style={{ minWidth: '0.5rem' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Заголовок категорії */}
      {(selectedCategory || selectedSubcategory) && (
        <div className="px-4 pt-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-white">
              {selectedCategoryData?.name || t('navigation.categories')}
            </h2>
            {/* Перемикач виду при виборі категорії */}
            {filteredAndSortedListings.length > 0 && (
              <div className="flex items-center gap-1 bg-gray-800/50 rounded-xl p-1">
                <button
                  onClick={() => {
                    setViewMode('grid');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#D3F1A7] text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Grid3x3 size={18} />
                </button>
                <button
                  onClick={() => {
                    setViewMode('list');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#D3F1A7] text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <List size={18} />
                </button>
              </div>
            )}
          </div>
          
          {/* Заголовок підкатегорії та кнопка очищення */}
          {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
            <div className="flex items-center justify-between mt-3 mb-3">
              <h3 className="text-base font-semibold text-white">Підкатегорії</h3>
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-white text-white bg-transparent hover:bg-white/10 transition-colors"
              >
                {t('common.clear')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Типи (підкатегорії) */}
      {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
        <div className="pl-4">
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

      {/* Сітка або список оголошень */}
      {filteredAndSortedListings.length > 0 ? (
        <>
          {viewMode === 'grid' ? (
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
          ) : (
            <div className="px-4 space-y-3 pb-4">
              {filteredAndSortedListings.map(listing => (
                <ListingCardColumn
                  key={listing.id}
                  listing={listing}
                  isFavorite={favorites.has(listing.id)}
                  onSelect={onSelectListing}
                  onToggleFavorite={onToggleFavorite}
                  tg={tg}
                />
              ))}
            </div>
          )}
          
          {/* Кнопка "Показати ще" - після списку товарів, перед нижнім меню */}
          {hasMore && filteredAndSortedListings.length > 0 && (
            <div className="px-4 py-4 pb-24 text-center">
              {onLoadMore && (
                <button
                  onClick={() => {
                    onLoadMore();
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-white text-white bg-transparent hover:bg-white/10 transition-colors"
                >
                  {t('common.showMore')}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="px-4 py-16 text-center">
          <p className="text-gray-400">{t('common.nothingFound')}</p>
          {(searchQuery || selectedCategory || selectedSubcategory || showFreeOnly) && (
            <button
              onClick={() => {
                onSearchChange('');
                setSelectedCategory(null);
                setSelectedSubcategory(null);
                setShowFreeOnly(false);
              }}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-medium border border-white text-white bg-transparent hover:bg-white/10 transition-colors"
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

