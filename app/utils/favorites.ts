const FAVORITES_STORAGE_KEY = 'ayn_marketplace_favorites';

export function normalizeFavoriteId(id: unknown): number | null {
  const n = typeof id === 'number' ? id : parseInt(String(id ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeFavoriteIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const id = normalizeFavoriteId(item);
    if (id != null && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Отримати favorites з localStorage (швидко). Id завжди number. */
export const getFavoritesFromStorage = (): Set<number> => {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      return new Set(normalizeFavoriteIds(JSON.parse(stored)));
    }
  } catch (error) {
    console.error('[getFavoritesFromStorage] Error reading favorites from localStorage:', error);
  }

  return new Set();
};

/** Зберегти favorites в localStorage */
export const saveFavoritesToStorage = (favorites: Set<number>): void => {
  if (typeof window === 'undefined') return;

  try {
    const favoritesArray = normalizeFavoriteIds(Array.from(favorites));
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoritesArray));
  } catch (error) {
    console.error('Error saving favorites to localStorage:', error);
  }
};

/** Злити локальні id з відповіддю API і зберегти. */
export const mergeFavoritesToStorage = (ids: Iterable<unknown>): Set<number> => {
  const merged = getFavoritesFromStorage();
  for (const raw of ids) {
    const id = normalizeFavoriteId(raw);
    if (id != null) merged.add(id);
  }
  saveFavoritesToStorage(merged);
  return merged;
};

/** Додати favorite — localStorage + БД для статистики */
export const addFavoriteToStorage = async (
  id: number,
  telegramId?: number | string
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const listingId = normalizeFavoriteId(id);
  if (listingId == null) return false;

  try {
    const favorites = getFavoritesFromStorage();
    favorites.add(listingId);
    saveFavoritesToStorage(favorites);
  } catch (error) {
    console.error('Error updating localStorage:', error);
  }

  if (telegramId != null && String(telegramId).trim() !== '') {
    fetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Рядок — інакше PG порівнює text = number і лайк не зберігається
        telegramId: String(telegramId).trim(),
        listingId,
      }),
    }).catch((error) => {
      console.error('Error saving favorite to DB (non-critical):', error);
    });
  }

  return true;
};

/** Видалити favorite — localStorage + БД */
export const removeFavoriteFromStorage = async (
  id: number,
  telegramId?: number | string
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const listingId = normalizeFavoriteId(id);
  if (listingId == null) return false;

  try {
    const favorites = getFavoritesFromStorage();
    favorites.delete(listingId);
    saveFavoritesToStorage(favorites);
  } catch (error) {
    console.error('Error updating localStorage:', error);
  }

  if (telegramId != null && String(telegramId).trim() !== '') {
    const tid = encodeURIComponent(String(telegramId).trim());
    fetch(`/api/favorites?telegramId=${tid}&listingId=${listingId}`, {
      method: 'DELETE',
    }).catch((error) => {
      console.error('Error removing favorite from DB (non-critical):', error);
    });
  }

  return true;
};
