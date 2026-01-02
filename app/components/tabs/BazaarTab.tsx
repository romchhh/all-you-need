import { Search, Plus, X, Gift, Clock } from 'lucide-react';
import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '../CategoryChip';
import { ListingCard } from '../ListingCard';
import { FilterBar } from '../FilterBar';
import { SortModal } from '../SortModal';
import { SubcategoryList } from '../SubcategoryList';
import { ListingGridSkeleton } from '../SkeletonLoader';
import { getSearchHistory, addToSearchHistory } from '@/utils/searchHistory';
import { useState, useMemo, useRef, useEffect } from 'react';

interface BazaarTabProps {
  categories: Category[];
  listings: Listing[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favorites: Set<number>;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  onPreviewListing?: (listing: Listing) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
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
  onPreviewListing,
  hasMore = false,
  onLoadMore,
  tg
}: BazaarTabProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortModal, setShowSortModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Listing[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
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
  }, [listings, selectedCategory, selectedSubcategory, showFreeOnly, searchQuery, sortBy]);

  const getSortLabel = () => {
    switch (sortBy) {
      case 'newest': return 'Новіші спочатку';
      case 'price_low': return 'Від дешевих';
      case 'price_high': return 'Від дорогих';
      case 'popular': return 'Найпопулярніші';
    }
  };

  return (
    <div className="pb-24">
      {/* Пошук */}
      <div className="p-4 bg-white sticky top-0 z-20 border-b border-gray-100">
        <div className="relative" ref={suggestionsRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Пошук"
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
      </div>

      {/* Кнопка створення */}
      <div className="px-4 pt-4 pb-3">
        <button 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
          onClick={() => {
            tg?.showAlert('Створення оголошення');
            tg?.HapticFeedback.impactOccurred('medium');
          }}
        >
          <Plus size={20} />
          Нове оголошення
        </button>
      </div>


      {/* Сортування */}
      <FilterBar 
        onSortClick={() => setShowSortModal(true)}
        sortLabel={getSortLabel()}
        tg={tg}
      />

      {/* Розділи */}
      {categories.length > 0 && (
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Розділи</h2>
            {(selectedCategory || selectedSubcategory) && (
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="text-sm text-blue-600 font-medium"
              >
                Очистити
              </button>
            )}
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-3 pb-2">
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
              onPreview={onPreviewListing}
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
              Очистити фільтри
            </button>
          )}
        </div>
      )}

      {/* Модальне вікно сортування */}
      <SortModal
        isOpen={showSortModal}
        currentSort={sortBy}
        onClose={() => setShowSortModal(false)}
        onSelect={(sort) => setSortBy(sort)}
        tg={tg}
      />
    </div>
  );
};

