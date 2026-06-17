import { X, Gift, MapPin, SlidersHorizontal, Grid3x3, List, Sun, Moon } from 'lucide-react';
import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '@/components/listing/CategoryChip';
import { CategoryIcon } from '@/components/listing/CategoryIcon';
import { ListingCard } from '@/components/listing/ListingCard';
import { ListingCardColumn } from '@/components/listing/ListingCardColumn';
import { SortModal } from '@/components/modals/SortModal';
import { CityModal } from '@/components/modals/CityModal';
import { SubcategoryList } from '@/components/listing/SubcategoryList';
import { STICKY_BELOW_APP_HEADER_CLASS } from '@/components/layout/FixedLogoHeader';
import { TopBar } from '@/components/layout/TopBar';
import { HomeActivityStats } from '@/components/home/HomeActivityStats';
import { HomePlatformTicker } from '@/components/home/HomePlatformTicker';
import { ListingsRefreshOverlay } from '@/components/ui/ListingsRefreshOverlay';
import { ListingGridSkeleton } from '@/components/ui/SkeletonLoader';
import { getSearchHistory, addToSearchHistory } from '@/utils/searchHistory';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { pickBazaarTabField } from '@/lib/bazaar/bazaarTabStateStorage';
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
  loadingMore?: boolean;
  initialLoading?: boolean;
  isRefreshing?: boolean;
  loadError?: boolean;
  onRetryLoad?: () => void;
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
  /** Telegram ID залогіненого користувача (міні-ап) — для підписок на місто */
  profileTelegramId?: string | null;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
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
  loadingMore = false,
  initialLoading = false,
  isRefreshing = false,
  loadError = false,
  onRetryLoad,
  onNavigateToCategories,
  onOpenCategoriesModal,
  initialSelectedCategory,
  savedState,
  onStateChange,
  tg,
  profileTelegramId,
  onToast
}: BazaarTabProps) => {
  const { t } = useLanguage();
  const { isLight, toggleTheme } = useTheme();
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';
  const ac = getAppearanceClasses(isLight);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    if (savedState?.selectedCategory != null) {
      return savedState.selectedCategory;
    }
    if (initialSelectedCategory != null) {
      return initialSelectedCategory;
    }
    return null;
  });

  useEffect(() => {
    if (initialSelectedCategory != null && savedState?.selectedCategory == null) {
      setSelectedCategory(initialSelectedCategory);
    }
  }, [initialSelectedCategory, savedState?.selectedCategory]);

  const lastSyncedCatalogKeyRef = useRef<string | null>(null);

  // Синхронізуємо локальний стан з savedState при монтуванні та при зміні
  useEffect(() => {
    if (savedState) {
      const catalogKey = `${savedState.selectedCategory ?? ''}|${savedState.selectedSubcategory ?? ''}`;
      const catalogChanged = lastSyncedCatalogKeyRef.current !== catalogKey;
      lastSyncedCatalogKeyRef.current = catalogKey;

      // Оновлюємо стан тільки якщо він справді змінився
      if (savedState.selectedCategory !== selectedCategory && savedState.selectedCategory !== undefined) {
        setSelectedCategory(savedState.selectedCategory);
      }
      if (savedState.selectedSubcategory !== selectedSubcategory && savedState.selectedSubcategory !== undefined) {
        setSelectedSubcategory(savedState.selectedSubcategory);
      }
      if (catalogChanged) {
        setMinPrice(null);
        setMaxPrice(null);
        setSelectedCondition(null);
        setSelectedCurrency(null);
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
    if (!savedState) return;
    setSelectedCategory(savedState.selectedCategory ?? null);
    setSelectedSubcategory(savedState.selectedSubcategory ?? null);
    setShowFreeOnly(savedState.showFreeOnly ?? false);
    setSortBy(savedState.sortBy ?? 'newest');
    setSelectedCities(savedState.selectedCities ?? []);
    setMinPrice(savedState.minPrice ?? null);
    setMaxPrice(savedState.maxPrice ?? null);
    setSelectedCondition(savedState.selectedCondition ?? null);
    setSelectedCurrency((savedState.selectedCurrency as Currency | null) ?? null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- лише при mount

  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() =>
    pickBazaarTabField(savedState, 'selectedSubcategory')
  );

  const [showFreeOnly, setShowFreeOnly] = useState<boolean>(() =>
    pickBazaarTabField(savedState, 'showFreeOnly')
  );

  const [sortBy, setSortBy] = useState<SortOption>(() => pickBazaarTabField(savedState, 'sortBy'));
  const [showSortModal, setShowSortModal] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>(() =>
    pickBazaarTabField(savedState, 'selectedCities')
  );
  
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const seenListingIdsRef = useRef<Set<number>>(new Set());
  const listingsInitializedRef = useRef(false);
  const [appearingListingIds, setAppearingListingIds] = useState<Set<number>>(new Set());
  
  const [minPrice, setMinPrice] = useState<number | null>(() =>
    pickBazaarTabField(savedState, 'minPrice')
  );

  const [maxPrice, setMaxPrice] = useState<number | null>(() =>
    pickBazaarTabField(savedState, 'maxPrice')
  );

  const [selectedCondition, setSelectedCondition] = useState<'new' | 'used' | null>(() =>
    pickBazaarTabField(savedState, 'selectedCondition')
  );

  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(() =>
    (pickBazaarTabField(savedState, 'selectedCurrency') as Currency | null) ?? null
  );
  
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
  
  
  // Не відправляємо стан батьку під час першого монтування (уникаємо циклу після закриття картки товару)
  const skipParentStateEchoRef = useRef(true);
  useEffect(() => {
    skipParentStateEchoRef.current = false;
  }, []);

  // Зберігаємо стан при зміні (лише після ініціалізації, лише коли щось змінилось локально)
  useEffect(() => {
    if (!onStateChange || skipParentStateEchoRef.current) return;
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
  }, [selectedCategory, selectedSubcategory, selectedCities, minPrice, maxPrice, selectedCondition, selectedCurrency, sortBy, showFreeOnly, onStateChange]);

  // Завантажуємо історію пошуку
  useEffect(() => {
    setSearchHistory(getSearchHistory());
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

  // Плавна поява нових оголошень при підвантаженні
  useEffect(() => {
    if (!listingsInitializedRef.current) {
      listings.forEach((l) => seenListingIdsRef.current.add(l.id));
      listingsInitializedRef.current = true;
      return;
    }

    const fresh = new Set<number>();
    listings.forEach((l) => {
      if (!seenListingIdsRef.current.has(l.id)) {
        fresh.add(l.id);
        seenListingIdsRef.current.add(l.id);
      }
    });

    if (fresh.size > 0) {
      setAppearingListingIds(fresh);
      const timer = setTimeout(() => setAppearingListingIds(new Set()), 600);
      return () => clearTimeout(timer);
    }
  }, [listings]);

  const filteredAndSortedListings = useMemo(() => {
    // Early return для порожнього списку
    if (listings.length === 0) return [];
    
    let filtered = listings;

    // Пошук — на сервері (після debounce). Локальну фільтрацію прибрано: вона дублювала роботу
    // і гальмувала UI при кожному символі в полі пошуку.

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
  }, [listings, showFreeOnly, sortBy, selectedCities, minPrice, maxPrice, selectedCondition, selectedCurrency]);

  // Автопідвантаження при прокрутці до кінця списку
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: '320px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, filteredAndSortedListings.length]);

  const getSortLabel = () => {
    switch (sortBy) {
      case 'newest': return t('bazaar.sort.newest');
      case 'price_low': return t('bazaar.sort.priceLow');
      case 'price_high': return t('bazaar.sort.priceHigh');
      case 'popular': return t('bazaar.sort.popular');
    }
  };


  const hasActiveFilters = !!(sortBy !== 'newest' || showFreeOnly || minPrice !== null || maxPrice !== null || selectedCategory || selectedSubcategory || selectedCities.length > 0 || selectedCondition !== null || selectedCurrency !== null);

  const renderCatalogToolbar = (showGridSwitch: boolean) => (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className={`flex items-center rounded-xl p-1 ${ac.toggleGroup}`}>
        <button
          type="button"
          onClick={() => {
            toggleTheme();
            tg?.HapticFeedback?.impactOccurred?.('light');
          }}
          className={`p-2 rounded-lg transition-colors ${ac.toggleInactive}`}
          aria-label={isLight ? 'Темна тема' : 'Світла тема'}
          title={isLight ? 'Темна тема' : 'Світла тема'}
        >
          {isLight ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
      {showGridSwitch && filteredAndSortedListings.length > 0 && (
        <div className={`flex items-center gap-1 rounded-xl p-1 ${ac.toggleGroup}`}>
          <button
            type="button"
            onClick={() => {
              setViewMode('grid');
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? ac.segmentedActive
                : ac.toggleInactive
            }`}
            aria-pressed={viewMode === 'grid'}
          >
            <Grid3x3 size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('list');
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list'
                ? ac.segmentedActive
                : ac.toggleInactive
            }`}
            aria-pressed={viewMode === 'list'}
          >
            <List size={18} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-24">
      {/* Пошук з TopBar — на десктопі вужчий і по центру */}
      <div className="relative">
        <div className={`${STICKY_BELOW_APP_HEADER_CLASS} bg-transparent px-4 pb-3 pt-2 max-lg:pt-1 lg:flex lg:justify-center lg:py-3`}>
          <div className="relative w-full max-w-full lg:max-w-xl xl:max-w-2xl">
            <div className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
              <TopBar
                variant="main"
                searchTriggerMode
                onOpenSearchModal={() => {
                  const q = searchQuery.trim();
                  const query = q ? `?q=${encodeURIComponent(q)}` : '';
                  router.push(`/${lang}/search${query}`);
                  tg?.HapticFeedback?.impactOccurred?.('light');
                }}
                onSearchChange={(query) => {
                  onSearchChange(query);
                }}
                onSearchSubmit={(query) => {
                  onSearchChange(query);
                  addToSearchHistory(query);
                  setSearchHistory(getSearchHistory());
                }}
                onFilterClick={() => {
                  setShowSortModal(true);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                onSearchClear={() => {
                  onSearchChange('');
                }}
                searchQuery={searchQuery}
                searchPlaceholder={selectedCities.length > 0 ? t('bazaar.searchInCity', { city: selectedCities[0] }) : t('bazaar.whatInterestsYou')}
                hasActiveFilters={hasActiveFilters}
                tg={tg}
              />
              </div>
              
              {/* Кнопка вибору міста */}
              <button
                onClick={() => setIsCityModalOpen(true)}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors relative ${
                  selectedCities.length > 0
                    ? isLight
                      ? 'border-[#3F5331] bg-transparent'
                      : 'border-[#C8E6A0] bg-[#C8E6A0]/10'
                    : isLight
                      ? 'border-gray-300 bg-transparent hover:bg-gray-100'
                      : 'border-white bg-transparent hover:bg-white/10'
                }`}
              >
                <MapPin
                  size={18}
                  className={
                    selectedCities.length > 0
                      ? isLight
                        ? 'text-[#3F5331]'
                        : 'text-[#C8E6A0]'
                      : isLight
                        ? 'text-gray-700'
                        : 'text-white'
                  }
                />
                {selectedCities.length > 0 && (
                  <>
                    <span
                      className={`pointer-events-none absolute top-1 right-1 z-20 h-2 w-2 rounded-full ring-2 ${
                        isLight
                          ? 'bg-[#3F5331] ring-gray-100'
                          : 'bg-[#C8E6A0] ring-black/50 shadow-[0_0_8px_rgba(200,230,160,0.75)]'
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`absolute bottom-0.5 right-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs font-bold ${
                        isLight
                          ? 'bg-[#3F5331] text-white'
                          : 'bg-[#C8E6A0] text-[#0f1408]'
                      }`}
                    >
                      {selectedCities.length > 9 ? '9+' : selectedCities.length}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {!searchQuery.trim() && (
        <>
          <div className="animate-content-in px-4 pb-2 lg:flex lg:justify-center lg:px-6">
            <div className="w-full max-w-full lg:max-w-xl xl:max-w-2xl">
              <HomePlatformTicker isLight={isLight} />
            </div>
          </div>
          <div className="animate-content-in overflow-visible px-4 pb-3 lg:flex lg:justify-center lg:px-6">
            <div className="w-full max-w-full overflow-visible lg:max-w-xl xl:max-w-2xl">
              <HomeActivityStats isLight={isLight} />
            </div>
          </div>
        </>
      )}

      {/* Розділи - показуємо тільки якщо не вибрана категорія та немає пошуку */}
      {categories.length > 0 && !selectedCategory && !searchQuery.trim() && (
        <div className="mx-auto w-full max-w-full pb-3 pt-2 lg:max-w-5xl xl:max-w-6xl">
          <div className="mb-3 flex items-center justify-between px-4 lg:px-6">
            <h2 className={`text-lg font-semibold ${ac.pageHeading}`}>{t('navigation.categories')}</h2>
            {renderCatalogToolbar(true)}
          </div>
          <div
            className="scrollbar-hide w-full max-w-full overflow-x-auto lg:px-6"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <div className="mx-auto flex w-max gap-2 px-4 pb-2 lg:px-0" style={{ minWidth: 'max-content' }}>
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
                  className={`w-14 h-14 rounded-xl flex items-center justify-center mb-1.5 transition-all relative overflow-hidden ${
                    isLight ? 'border-2 border-[#3F5331] bg-white' : 'border border-white/25 bg-[#1C1C1C]'
                  }`}
                >
                  <CategoryIcon categoryId="all_categories" isActive={false} size={32} />
                </div>
                <span
                  className={`text-xs font-medium text-center whitespace-normal leading-tight px-0.5 ${ac.categoryRowLabel}`}
                >
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
            <h2 className={`text-lg font-semibold ${ac.pageHeading}`}>
              {selectedCategoryData?.name || t('navigation.categories')}
            </h2>
            {renderCatalogToolbar(true)}
          </div>
          
          {/* Кнопка очищення для категорії "Безкоштовно" */}
          {(showFreeOnly || selectedCategory === 'free') && !selectedCategoryData?.subcategories?.length && (
            <div className="flex items-center justify-end mt-3 mb-3">
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  setShowFreeOnly(false);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={ac.outlineButton}
              >
                {t('common.clear')}
              </button>
            </div>
          )}

          {/* Заголовок підкатегорії та кнопка очищення */}
          {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
            <div className="flex items-center justify-between mt-3 mb-3">
              <h3 className={`text-base font-semibold ${ac.pageHeading}`}>Підкатегорії</h3>
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  setShowFreeOnly(false);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={ac.outlineButton}
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
            categoryId={selectedCategory}
          />
        </div>
      )}

      {/* Сітка або список оголошень */}
      {initialLoading && filteredAndSortedListings.length === 0 ? (
        <div className="animate-content-in px-4 pb-4 sm:px-6 w-full max-w-[1680px] mx-auto">
          <ListingGridSkeleton count={6} compact />
        </div>
      ) : filteredAndSortedListings.length > 0 ? (
        <>
          <div
            className={`relative transition-opacity duration-300 ease-out ${
              isRefreshing ? 'opacity-45' : 'opacity-100'
            }`}
          >
            {isRefreshing && <ListingsRefreshOverlay />}
            {viewMode === 'grid' ? (
              <div className="px-4 sm:px-6 pb-4 w-full max-w-[1680px] mx-auto">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [grid-auto-rows:1fr]">
                  {filteredAndSortedListings.map((listing) => (
                    <div
                      key={listing.id}
                      className={
                        appearingListingIds.has(listing.id) ? 'animate-listing-appear' : undefined
                      }
                    >
                      <ListingCard
                        listing={listing}
                        isFavorite={favorites.has(listing.id)}
                        onSelect={onSelectListing}
                        onToggleFavorite={onToggleFavorite}
                        tg={tg}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 px-4 pb-4">
                {filteredAndSortedListings.map((listing) => (
                  <div
                    key={listing.id}
                    className={
                      appearingListingIds.has(listing.id) ? 'animate-listing-appear' : undefined
                    }
                  >
                    <ListingCardColumn
                      listing={listing}
                      isFavorite={favorites.has(listing.id)}
                      onSelect={onSelectListing}
                      onToggleFavorite={onToggleFavorite}
                      tg={tg}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Автопідвантаження — sentinel + індикатор */}
          {(hasMore || loadingMore) && (
            <div ref={loadMoreSentinelRef} className="flex justify-center px-4 py-6 pb-24">
              {loadingMore && (
                <div
                  className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
                    isLight ? 'border-[#3F5331]/30 border-t-[#3F5331]' : 'border-white/20 border-t-[#C8E6A0]'
                  }`}
                />
              )}
            </div>
          )}
        </>
      ) : isRefreshing ? (
        <div className="relative min-h-[40vh] px-4 py-16">
          <ListingsRefreshOverlay />
        </div>
      ) : loadError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 py-12 text-center">
          <p className={`max-w-sm text-base font-medium leading-relaxed ${ac.pageHeading}`}>
            {t('common.listingsLoadFailed')}
          </p>
          {onRetryLoad && (
            <button
              type="button"
              onClick={onRetryLoad}
              className={`mt-6 rounded-xl px-8 py-3.5 text-sm font-semibold transition-colors ${ac.outlineButton}`}
            >
              {t('common.tryAgain')}
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 py-16 text-center">
          <p className={ac.nothingFound}>{t('common.nothingFound')}</p>
          {(searchQuery || selectedCategory || selectedSubcategory || showFreeOnly) && (
            <button
              onClick={() => {
                onSearchChange('');
                setSelectedCategory(null);
                setSelectedSubcategory(null);
                setShowFreeOnly(false);
              }}
              className={`mt-4 ${ac.outlineButton}`}
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
        profileTelegramId={profileTelegramId}
        onToast={onToast}
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
    prevProps.initialSelectedCategory === nextProps.initialSelectedCategory &&
    prevProps.profileTelegramId === nextProps.profileTelegramId &&
    prevProps.initialLoading === nextProps.initialLoading &&
    prevProps.isRefreshing === nextProps.isRefreshing &&
    prevProps.loadError === nextProps.loadError &&
    prevProps.hasMore === nextProps.hasMore &&
    prevProps.loadingMore === nextProps.loadingMore &&
    prevProps.onSelectListing === nextProps.onSelectListing &&
    prevProps.onStateChange === nextProps.onStateChange &&
    prevProps.onRetryLoad === nextProps.onRetryLoad &&
    prevProps.onToast === nextProps.onToast
  );
});

