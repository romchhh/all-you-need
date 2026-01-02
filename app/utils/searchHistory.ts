const SEARCH_HISTORY_KEY = 'ayn_marketplace_search_history';
const MAX_HISTORY_ITEMS = 10;

export const getSearchHistory = (): string[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored) as string[];
    }
  } catch (error) {
    console.error('Error reading search history:', error);
  }
  
  return [];
};

export const addToSearchHistory = (query: string): void => {
  if (typeof window === 'undefined' || !query.trim()) return;
  
  try {
    const history = getSearchHistory();
    const trimmedQuery = query.trim();
    
    // Видаляємо дублікати
    const filtered = history.filter(item => item.toLowerCase() !== trimmedQuery.toLowerCase());
    
    // Додаємо на початок
    const updated = [trimmedQuery, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving search history:', error);
  }
};

export const clearSearchHistory = (): void => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing search history:', error);
  }
};

