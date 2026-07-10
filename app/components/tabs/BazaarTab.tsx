import { X, Gift, MapPin, SlidersHorizontal, Grid3x3, List, Sun, Moon } from 'lucide-react';
import { Category, Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { CategoryChip } from '@/components/listing/CategoryChip';
import { CategoryIcon } from '@/components/listing/CategoryIcon';
import { ListingCard } from '@/components/listing/ListingCard';
import { ListingCardColumn } from '@/components/listing/ListingCardColumn';
import dynamic from 'next/dynamic';
import { SubcategoryList } from '@/components/listing/SubcategoryList';
import { STICKY_BELOW_APP_HEADER_CLASS } from '@/components/layout/FixedLogoHeader';
import { TopBar } from '@/components/layout/TopBar';
import type { PlatformOnboardingActionId } from '@/utils/platformTickerMessages';
import { ListingsRefreshOverlay } from '@/components/ui/ListingsRefreshOverlay';
import { ListingGridSkeleton } from '@/components/ui/SkeletonLoader';
import { getSearchHistory, addToSearchHistory } from '@/utils/searchHistory';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useState, useMemo, useRef, useEffect, useCallback, memo, useDeferredValue } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { pickBazaarTabField } from '@/lib/bazaar/bazaarTabStateStorage';
import { Currency } from '@/utils/currency';

const SortModal = dynamic(
  () => import('@/components/modals/SortModal').then((m) => ({ default: m.SortModal })),
  { ssr: false }
);
const CityModal = dynamic(
  () => import('@/components/modals/CityModal').then((m) => ({ default: m.CityModal })),
  { ssr: false }
);
const HomePlatformTicker = dynamic(
  () =>
    import('@/components/home/HomePlatformTicker').then((m) => ({
      default: m.HomePlatformTicker,
    })),
  { ssr: false }
);
const HomeActivityStats = dynamic(
  () =>
    import('@/components/home/HomeActivityStats').then((m) => ({
      default: m.HomeActivityStats,
    })),
  { ssr: false }
);

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
  const [showHomeWidgets, setShowHomeWidgets] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (!cancelled) setShowHomeWidgets(true);
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(show, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = setTimeout(show, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const deferredListings = useDeferredValue(listings);

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
  const [cityModalOpenSubscriptions, setCityModalOpenSubscriptions] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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

  type CatalogFilterState = {
    selectedCategory: string | null;
    selectedSubcategory: string | null;
    selectedCities: string[];
    minPrice: number | null;
    maxPrice: number | null;
    selectedCondition: 'new' | 'used' | null;
    selectedCurrency: string | null;
    sortBy: SortOption;
    showFreeOnly: boolean;
  };

  const buildCatalogState = useCallback(
    (patch: Partial<CatalogFilterState>): CatalogFilterState => ({
      selectedCategory:
        patch.selectedCategory !== undefined ? patch.selectedCategory : selectedCategory,
      selectedSubcategory:
        patch.selectedSubcategory !== undefined ? patch.selectedSubcategory : selectedSubcategory,
      selectedCities: patch.selectedCities !== undefined ? patch.selectedCities : selectedCities,
      minPrice: patch.minPrice !== undefined ? patch.minPrice : minPrice,
      maxPrice: patch.maxPrice !== undefined ? patch.maxPrice : maxPrice,
      selectedCondition:
        patch.selectedCondition !== undefined ? patch.selectedCondition : selectedCondition,
      selectedCurrency:
        patch.selectedCurrency !== undefined ? patch.selectedCurrency : selectedCurrency,
      sortBy: patch.sortBy !== undefined ? patch.sortBy : sortBy,
      showFreeOnly: patch.showFreeOnly !== undefined ? patch.showFreeOnly : showFreeOnly,
    }),
    [
      selectedCategory,
      selectedSubcategory,
      selectedCities,
      minPrice,
      maxPrice,
      selectedCondition,
      selectedCurrency,
      sortBy,
      showFreeOnly,
    ]
  );

  const commitCatalogState = useCallback(
    (patch: Partial<CatalogFilterState>) => {
      if (patch.selectedCategory !== undefined) setSelectedCategory(patch.selectedCategory);
      if (patch.selectedSubcategory !== undefined) setSelectedSubcategory(patch.selectedSubcategory);
      if (patch.selectedCities !== undefined) setSelectedCities(patch.selectedCities);
      if (patch.minPrice !== undefined) setMinPrice(patch.minPrice);
      if (patch.maxPrice !== undefined) setMaxPrice(patch.maxPrice);
      if (patch.selectedCondition !== undefined) setSelectedCondition(patch.selectedCondition);
      if (patch.selectedCurrency !== undefined) {
        setSelectedCurrency(patch.selectedCurrency as Currency | null);
      }
      if (patch.sortBy !== undefined) setSortBy(patch.sortBy);
      if (patch.showFreeOnly !== undefined) setShowFreeOnly(patch.showFreeOnly);
      onStateChange?.(buildCatalogState(patch));
    },
    [buildCatalogState, onStateChange]
  );

  const handleOnboardingAction = useCallback(
    (action: PlatformOnboardingActionId) => {
      tg?.HapticFeedback?.impactOccurred('light');

      switch (action) {
        case 'createListing':
          onCreateListing?.();
          break;
        case 'selectCity':
          setCityModalOpenSubscriptions(false);
          setIsCityModalOpen(true);
          break;
        case 'notifications':
          setCityModalOpenSubscriptions(true);
          setIsCityModalOpen(true);
          break;
        case 'favorites':
          router.push(`/${lang}/favorites`);
          break;
        case 'promotion':
          router.push(`/${lang}/ads-rules`);
          break;
        case 'referral':
          router.push(`/${lang}/referral`);
          break;
      }
    },
    [tg, onCreateListing, router, lang]
  );

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

  // Фільтри price/condition/currency — на сервері через /api/listings/feed
  const filteredAndSortedListings = deferredListings;

  // Автопідвантаження при прокрутці до кінця списку (нативний window scroll)
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
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

      {!searchQuery.trim() && showHomeWidgets && (
        <>
          <div className="animate-content-in px-4 pb-2 lg:flex lg:justify-center lg:px-6">
            <div className="w-full max-w-full lg:max-w-xl xl:max-w-2xl">
              <HomePlatformTicker isLight={isLight} onOnboardingAction={handleOnboardingAction} />
            </div>
          </div>
          <div className="animate-content-in overflow-visible px-4 pb-3 lg:flex lg:justify-center lg:px-6">
            <div className="w-full max-w-full overflow-visible lg:max-w-xl xl:max-w-2xl">
              <HomeActivityStats isLight={isLight} />
            </div>
          </div>
        </>
      )}

      {/* Розділи — під статистикою, якщо не вибрана категорія */}
      {categories.length > 0 && !selectedCategory && !searchQuery.trim() && (
        <div className="relative z-[15] mx-auto w-full max-w-full touch-manipulation pb-3 pt-2 lg:max-w-5xl xl:max-w-6xl">
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
              <button
                type="button"
                className="flex flex-col items-center min-w-[80px] max-w-[90px] cursor-pointer flex-shrink-0 touch-manipulation select-none bg-transparent border-0 p-0"
                onClick={() => {
                  if (onOpenCategoriesModal) {
                    onOpenCategoriesModal();
                    tg?.HapticFeedback.impactOccurred('light');
                  } else if (onNavigateToCategories) {
                    onNavigateToCategories();
                    tg?.HapticFeedback.impactOccurred('light');
                  } else {
                    commitCatalogState({
                      selectedCategory: null,
                      selectedSubcategory: null,
                    });
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
              </button>
              
              {categories.map(category => (
                <CategoryChip
                  key={category.id}
                  category={category}
                  isActive={false}
                  onClick={() => {
                    commitCatalogState({
                      selectedCategory: category.id,
                      selectedSubcategory: null,
                    });
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
                  commitCatalogState({
                    selectedCategory: null,
                    selectedSubcategory: null,
                    showFreeOnly: false,
                  });
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
                  commitCatalogState({
                    selectedCategory: null,
                    selectedSubcategory: null,
                    showFreeOnly: false,
                  });
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
              commitCatalogState({ selectedSubcategory: subcategoryId });
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
                  {filteredAndSortedListings.map((listing, index) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      isFavorite={favorites.has(listing.id)}
                      onSelect={onSelectListing}
                      onToggleFavorite={onToggleFavorite}
                      tg={tg}
                      priority={index < 4}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 px-4 pb-4">
                {filteredAndSortedListings.map((listing) => (
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
          </div>

          {(hasMore || loadingMore) && (
            <div
              ref={loadMoreSentinelRef}
              className="flex min-h-8 justify-center px-4 py-6 pb-24"
              aria-hidden={!loadingMore}
            >
              {loadingMore && (
                <div
                  className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
                    isLight
                      ? 'border-[#3F5331]/30 border-t-[#3F5331]'
                      : 'border-white/20 border-t-[#C8E6A0]'
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
        onClose={() => {
          setIsCityModalOpen(false);
          setCityModalOpenSubscriptions(false);
        }}
        onSelect={(cities) => setSelectedCities(cities)}
        tg={tg}
        profileTelegramId={profileTelegramId}
        onToast={onToast}
        openSubscriptionsSection={cityModalOpenSubscriptions}
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

