export type BazaarTabPersistedState = {
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

export const DEFAULT_BAZAAR_TAB_STATE: BazaarTabPersistedState = {
  selectedCategory: null,
  selectedSubcategory: null,
  selectedCities: [],
  minPrice: null,
  maxPrice: null,
  selectedCondition: null,
  selectedCurrency: null,
  sortBy: 'newest',
  showFreeOnly: false,
};

const STORAGE_KEY = 'bazaarTabState';

/** Завантажує фільтри базару; категорія не відновлюється між заходами. */
export function loadBazaarTabStateFromStorage(): BazaarTabPersistedState {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BAZAAR_TAB_STATE };
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return { ...DEFAULT_BAZAAR_TAB_STATE };
  }
  try {
    const parsed = JSON.parse(saved) as Partial<BazaarTabPersistedState>;
    return {
      ...DEFAULT_BAZAAR_TAB_STATE,
      ...parsed,
      selectedCategory: null,
      selectedSubcategory: null,
    };
  } catch {
    return { ...DEFAULT_BAZAAR_TAB_STATE };
  }
}

export function pickBazaarTabField<K extends keyof BazaarTabPersistedState>(
  savedState: Partial<BazaarTabPersistedState> | undefined,
  key: K
): BazaarTabPersistedState[K] {
  const value = savedState?.[key];
  if (value !== undefined) {
    return value as BazaarTabPersistedState[K];
  }
  return DEFAULT_BAZAAR_TAB_STATE[key];
}

/** Зберігає фільтри без категорії (лише в межах поточної сесії через React state). */
export function persistBazaarTabState(state: BazaarTabPersistedState): void {
  if (typeof window === 'undefined') return;
  const { selectedCategory: _c, selectedSubcategory: _s, ...rest } = state;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...rest,
      selectedCategory: null,
      selectedSubcategory: null,
    })
  );
}
