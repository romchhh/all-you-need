const FAVORITES_STORAGE_KEY = 'ayn_marketplace_favorites';

// Отримати favorites з localStorage (швидко)
export const getFavoritesFromStorage = (): Set<number> => {
  if (typeof window === 'undefined') return new Set();
  
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      const favorites = JSON.parse(stored) as number[];
      return new Set(favorites);
    }
  } catch (error) {
    console.error('Error reading favorites from localStorage:', error);
  }
  
  return new Set();
};

// Зберегти favorites в localStorage
export const saveFavoritesToStorage = (favorites: Set<number>): void => {
  if (typeof window === 'undefined') return;
  
  try {
    const favoritesArray = Array.from(favorites);
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoritesArray));
  } catch (error) {
    console.error('Error saving favorites to localStorage:', error);
  }
};

// Додати favorite - зберігає в localStorage і відправляє в БД для статистики
export const addFavoriteToStorage = async (id: number, telegramId?: number | string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  // Оновлюємо localStorage (швидко, синхронно)
  try {
    const favorites = getFavoritesFromStorage();
    favorites.add(id);
    saveFavoritesToStorage(favorites);
  } catch (error) {
    console.error('Error updating localStorage:', error);
  }
  
  // Відправляємо в БД для статистики (асинхронно, не чекаємо)
  if (telegramId) {
    fetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegramId,
        listingId: id,
      }),
    }).catch(error => {
      console.error('Error saving favorite to DB (non-critical):', error);
    });
  }
  
  return true;
};

// Видалити favorite - видаляє з localStorage і з БД
export const removeFavoriteFromStorage = async (id: number, telegramId?: number | string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  // Оновлюємо localStorage (швидко, синхронно)
  try {
    const favorites = getFavoritesFromStorage();
    favorites.delete(id);
    saveFavoritesToStorage(favorites);
  } catch (error) {
    console.error('Error updating localStorage:', error);
  }
  
  // Видаляємо з БД (асинхронно, не чекаємо)
  if (telegramId) {
    fetch(`/api/favorites?telegramId=${telegramId}&listingId=${id}`, {
      method: 'DELETE',
    }).catch(error => {
      console.error('Error removing favorite from DB (non-critical):', error);
    });
  }
  
  return true;
};
