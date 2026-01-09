const FAVORITES_STORAGE_KEY = 'ayn_marketplace_favorites';

// Отримати favorites з API (з кешуванням в localStorage для швидкого доступу)
export const getFavoritesFromStorage = async (telegramId?: number | string): Promise<Set<number>> => {
  if (typeof window === 'undefined') return new Set();
  
  // Якщо є telegramId, завантажуємо з API
  if (telegramId) {
    try {
      const response = await fetch(`/api/favorites?telegramId=${telegramId}`);
      if (response.ok) {
        const data = await response.json();
        const favoritesArray = (data.favorites || []) as number[];
        const favorites = new Set(favoritesArray);
        // Кешуємо в localStorage для швидкого доступу
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
        return favorites;
      }
    } catch (error) {
      console.error('Error fetching favorites from API:', error);
    }
  }
  
  // Fallback до localStorage (для сумісності)
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

// Синхронна версія для швидкого доступу (з localStorage)
export const getFavoritesFromStorageSync = (): Set<number> => {
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

// Додати favorite через API
export const addFavoriteToStorage = async (id: number, telegramId: number | string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  try {
    const response = await fetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegramId,
        listingId: id,
      }),
    });
    
    if (response.ok) {
      // Оновлюємо локальний кеш
      const favorites = getFavoritesFromStorageSync();
      favorites.add(id);
      saveFavoritesToStorage(favorites);
      return true;
    }
  } catch (error) {
    console.error('Error adding favorite:', error);
  }
  
  return false;
};

// Видалити favorite через API
export const removeFavoriteFromStorage = async (id: number, telegramId: number | string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  try {
    const response = await fetch(`/api/favorites?telegramId=${telegramId}&listingId=${id}`, {
      method: 'DELETE',
    });
    
    if (response.ok) {
      // Оновлюємо локальний кеш
      const favorites = getFavoritesFromStorageSync();
      favorites.delete(id);
      saveFavoritesToStorage(favorites);
      return true;
    }
  } catch (error) {
    console.error('Error removing favorite:', error);
  }
  
  return false;
};
