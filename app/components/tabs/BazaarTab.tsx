import { Search, X, Gift, Clock, MapPin, SlidersHorizontal } from 'lucide-react';
import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '../CategoryChip';
import { ListingCard } from '../ListingCard';
import { SortModal } from '../SortModal';
import { SubcategoryList } from '../SubcategoryList';
import { ListingGridSkeleton } from '../SkeletonLoader';
import { getSearchHistory, addToSearchHistory } from '@/utils/searchHistory';
import { germanCities } from '@/constants/german-cities';
import { ukrainianCities } from '@/constants/ukrainian-cities';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useMemo, useRef, useEffect } from 'react';

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
  tg: TelegramWebApp | null;
}

type SortOption = 'newest' | 'price_low' | 'price_high' | 'popular';

export const BazaarTab = ({
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
  tg
}: BazaarTabProps) => {
  const { t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortModal, setShowSortModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Listing[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
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

  // Генеруємо підказки для автодоповнення
  const searchSuggestions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    // Якщо немає запиту, показуємо історію пошуку
    if (!query) {
      return searchHistory.slice(0, 5);
    }
    
    if (query.length < 2) return [];
    
    const suggestionsSet = new Set<string>();
    
    // Додаємо назви товарів, які містять запит
    listings.forEach(listing => {
      const title = listing.title.toLowerCase();
      if (title.includes(query)) {
        suggestionsSet.add(listing.title);
        title.split(/\s+/).forEach(word => {
          if (word.length >= 2 && word.startsWith(query)) {
            suggestionsSet.add(word.charAt(0).toUpperCase() + word.slice(1));
          }
        });
      }
    });
    
    // Додаємо локації
    listings.forEach(listing => {
      const location = listing.location.toLowerCase();
      if (location.includes(query)) {
        suggestionsSet.add(listing.location);
      }
    });
    
    // Додаємо категорії та підкатегорії
    categories.forEach(category => {
      if (category.name.toLowerCase().includes(query)) {
        suggestionsSet.add(category.name);
      }
      category.subcategories?.forEach(sub => {
        if (sub.name.toLowerCase().includes(query)) {
          suggestionsSet.add(sub.name);
        }
      });
    });
    
    return Array.from(suggestionsSet).slice(0, 5);
  }, [searchQuery, listings, categories, searchHistory]);

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

    // Фільтр по категорії
    if (selectedCategory) {
      filtered = filtered.filter(listing => listing.category === selectedCategory);
    }

    // Фільтр по підкатегорії
    if (selectedSubcategory) {
      filtered = filtered.filter(listing => listing.subcategory === selectedSubcategory);
    }

    // Фільтр безкоштовних
    if (showFreeOnly) {
      filtered = filtered.filter(listing => listing.isFree || listing.price.toLowerCase().includes('безкоштовно'));
    }

    // Фільтр по місту
    if (selectedCity.trim()) {
      filtered = filtered.filter(listing => 
        listing.location.toLowerCase().includes(selectedCity.toLowerCase())
      );
    }

    // Фільтр по діапазону цін
    if (minPrice !== null || maxPrice !== null) {
      filtered = filtered.filter(listing => {
        if (listing.isFree || listing.price.toLowerCase().includes('безкоштовно')) {
          return minPrice === null || minPrice === 0; // Безкоштовні показуємо тільки якщо мін. ціна = 0
        }
        const price = parseInt(listing.price.replace(/\s/g, '').replace('₴', '').replace('€', '')) || 0;
        if (minPrice !== null && price < minPrice) return false;
        if (maxPrice !== null && price > maxPrice) return false;
        return true;
      });
    }

    // Фільтр по пошуку
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
  }, [listings, selectedCategory, selectedSubcategory, showFreeOnly, searchQuery, sortBy, selectedCity, minPrice, maxPrice]);

  const getSortLabel = () => {
    switch (sortBy) {
      case 'newest': return t('bazaar.sort.newest');
      case 'price_low': return t('bazaar.sort.priceLow');
      case 'price_high': return t('bazaar.sort.priceHigh');
      case 'popular': return t('bazaar.sort.popular');
    }
  };

  // Об'єднуємо німецькі та українські міста
  const allCities = useMemo(() => {
    const combined = [...germanCities, ...ukrainianCities];
    // Видаляємо дублікати та сортуємо
    return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b));
  }, []);

  const filteredCities = cityQuery
    ? allCities.filter(city =>
        city.toLowerCase().includes(cityQuery.toLowerCase())
      ).slice(0, 10)
    : allCities.slice(0, 10);

  return (
    <div className="pb-24">
      {/* Пошук */}
      <div className="p-4 bg-white sticky top-0 z-20 border-b border-gray-100">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1" ref={suggestionsRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={selectedCity ? t('bazaar.searchInCity', { city: selectedCity }) : t('bazaar.whatInterestsYou')}
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (searchSuggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              className="w-full pl-10 pr-10 py-3 bg-gray-100 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  onSearchChange('');
                  setShowSuggestions(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors"
              >
                <X size={14} className="text-gray-900" />
              </button>
            )}
            
            {/* Підказки автодоповнення */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-lg z-30 max-h-60 overflow-y-auto">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      onSearchChange(suggestion);
                      addToSearchHistory(suggestion);
                      setSearchHistory(getSearchHistory());
                      setShowSuggestions(false);
                      searchInputRef.current?.blur();
                      tg?.HapticFeedback.impactOccurred('light');
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
          </div>
          
          {/* Перемикач мови (глобус) */}
          <LanguageSwitcher tg={tg} />
          
          {/* Кнопка сортування та фільтрів */}
          <button
            onClick={() => {
              setShowSortModal(true);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`px-3 py-3 rounded-xl flex items-center gap-1 transition-colors ${
              sortBy !== 'newest' || showFreeOnly || minPrice !== null || maxPrice !== null
                ? 'bg-blue-50 border-2 border-blue-500'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <SlidersHorizontal size={18} className="text-gray-900" />
          </button>
          
          {/* Кнопка вибору міста */}
          <button
            onClick={() => setIsCityModalOpen(true)}
            className={`px-3 py-3 rounded-xl flex items-center gap-1 transition-colors ${
              selectedCity
                ? 'bg-green-50 border-2 border-green-500'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <MapPin size={18} className="text-gray-900" />
          </button>
        </div>
      </div>



      {/* Розділи */}
      {categories.length > 0 && (
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('navigation.categories')}</h2>
            {(selectedCategory || selectedSubcategory) && (
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="text-sm text-blue-600 font-medium"
              >
                {t('common.clear')}
              </button>
            )}
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-3 pb-2">
              {/* Кнопка "Всі категорії" */}
              <div 
                className="flex flex-col items-center min-w-[100px] max-w-[120px] cursor-pointer"
                onClick={() => {
                  if (onNavigateToCategories) {
                    onNavigateToCategories();
                    tg?.HapticFeedback.impactOccurred('light');
                  } else {
                    setSelectedCategory(null);
                    setSelectedSubcategory(null);
                    tg?.HapticFeedback.impactOccurred('light');
                  }
                }}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-2 transition-all ${
                  !selectedCategory && !selectedSubcategory
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                  📦
                </div>
                <span className={`text-xs font-medium text-center whitespace-normal leading-tight ${
                  !selectedCategory && !selectedSubcategory ? 'text-blue-600' : 'text-gray-700'
                }`}>
                  {t('bazaar.allCategories')}
                </span>
              </div>
              
              {categories.map(category => (
                <CategoryChip 
                  key={category.id} 
                  category={category}
                  isActive={selectedCategory === category.id}
                  onClick={() => {
                    const newCategory = selectedCategory === category.id ? null : category.id;
                    setSelectedCategory(newCategory);
                    if (!newCategory) {
                      setSelectedSubcategory(null);
                    }
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                />
              ))}
            </div>
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
        <div className="px-4 py-16 text-center">
          <p className="text-gray-500">Нічого не знайдено</p>
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
        onClose={() => setShowSortModal(false)}
        onSelect={(sort) => setSortBy(sort)}
        onToggleFreeOnly={(value) => setShowFreeOnly(value)}
        onPriceRangeChange={(min, max) => {
          setMinPrice(min);
          setMaxPrice(max);
        }}
        tg={tg}
      />

      {/* Модальне вікно вибору міста */}
      {isCityModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">{t('bazaar.selectCity')}</h2>
              <button
                onClick={() => {
                  setIsCityModalOpen(false);
                  setCityQuery('');
                }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={18} className="text-gray-900" />
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder={t('bazaar.searchCity')}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
              />
            </div>
            <div className="max-h-96 overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedCity('');
                  setIsCityModalOpen(false);
                  setCityQuery('');
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full px-4 py-3 text-left rounded-xl mb-2 transition-colors ${
                  !selectedCity
                    ? 'bg-green-50 text-green-700 border-2 border-green-500'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-green-500" />
                  <span className="font-medium">{t('bazaar.allCities')}</span>
                </div>
              </button>
              {filteredCities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    setSelectedCity(city);
                    setIsCityModalOpen(false);
                    setCityQuery('');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`w-full px-4 py-3 text-left rounded-xl mb-2 transition-colors flex items-center gap-2 ${
                    selectedCity === city
                      ? 'bg-green-50 text-green-700 border-2 border-green-500'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <MapPin size={16} className={selectedCity === city ? 'text-green-500' : 'text-gray-400'} />
                  <span>{city}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

