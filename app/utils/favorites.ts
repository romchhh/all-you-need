const FAVORITES_STORAGE_KEY = 'ayn_marketplace_favorites';

export const getFavoritesFromStorage = (): Set<number> => {
  if (typeof window === 'undefined') return new Set();
  
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      const favorites = JSON.parse(stored) as number[];
      return new Set(favorites);
    }
  } catch (error) {
    console.error('Error reading favorites from storage:', error);
  }
  
  return new Set();
};

export const saveFavoritesToStorage = (favorites: Set<number>): void => {
  if (typeof window === 'undefined') return;
  
  try {
    const favoritesArray = Array.from(favorites);
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoritesArray));
  } catch (error) {
    console.error('Error saving favorites to storage:', error);
  }
};

export const addFavoriteToStorage = (id: number): void => {
  const favorites = getFavoritesFromStorage();
  favorites.add(id);
  saveFavoritesToStorage(favorites);
};

export const removeFavoriteFromStorage = (id: number): void => {
  const favorites = getFavoritesFromStorage();
  favorites.delete(id);
  saveFavoritesToStorage(favorites);
};

