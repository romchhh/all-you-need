// Простий кеш для API-запитів
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 хвилин для товарів та категорій

// Кеш в localStorage для персистентного зберігання
const STORAGE_PREFIX = 'cache_';
const STORAGE_CACHE_DURATION = 30 * 60 * 1000; // 30 хвилин

export const getCachedData = (key: string, useStorage: boolean = true): any | null => {
  // Спочатку перевіряємо in-memory кеш
  const cached = cache.get(key);
  if (cached) {
    const now = Date.now();
    if (now - cached.timestamp <= CACHE_DURATION) {
      return cached.data;
    } else {
      cache.delete(key);
    }
  }
  
  // Якщо немає в пам'яті, перевіряємо localStorage
  if (useStorage && typeof window !== 'undefined' && window.localStorage) {
    try {
      const storageKey = `${STORAGE_PREFIX}${key}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        if (now - parsed.timestamp <= STORAGE_CACHE_DURATION) {
          // Відновлюємо в пам'яті
          cache.set(key, { data: parsed.data, timestamp: parsed.timestamp });
          return parsed.data;
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (e) {
      // Використовуємо logger замість console
      if (process.env.NODE_ENV === 'development') {
        console.error('Error reading from localStorage cache:', e);
      }
    }
  }
  
  return null;
};

export const setCachedData = (key: string, data: any, useStorage: boolean = true): void => {
  const timestamp = Date.now();
  cache.set(key, { data, timestamp });
  
  // Також зберігаємо в localStorage для персистентності
  if (useStorage && typeof window !== 'undefined' && window.localStorage) {
    try {
      const storageKey = `${STORAGE_PREFIX}${key}`;
      localStorage.setItem(storageKey, JSON.stringify({ data, timestamp }));
    } catch (e) {
      // Використовуємо logger замість console
      if (process.env.NODE_ENV === 'development') {
        console.error('Error writing to localStorage cache:', e);
      }
      // Якщо localStorage переповнений, очищаємо старі записи
      clearOldCacheEntries();
    }
  }
};

export const clearCache = (): void => {
  cache.clear();
  if (typeof window !== 'undefined' && window.localStorage) {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
};

export const invalidateCache = (pattern: string): void => {
  // Очищаємо з пам'яті
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
  
  // Очищаємо з localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX) && key.includes(pattern)) {
        localStorage.removeItem(key);
      }
    });
  }
};

// Очищаємо старі записи з кешу
const clearOldCacheEntries = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  
  const now = Date.now();
  const keys = Object.keys(localStorage);
  let cleared = 0;
  
  keys.forEach(key => {
    if (key.startsWith(STORAGE_PREFIX)) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (now - parsed.timestamp > STORAGE_CACHE_DURATION) {
            localStorage.removeItem(key);
            cleared++;
          }
        }
      } catch (e) {
        // Видаляємо невалідні записи
        localStorage.removeItem(key);
        cleared++;
      }
    }
  });
  
  // Якщо все ще переповнений, видаляємо найстаріші записи
  if (cleared === 0) {
    const cacheEntries: Array<{ key: string; timestamp: number }> = [];
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            cacheEntries.push({ key, timestamp: parsed.timestamp });
          }
        } catch (e) {
          // ignore
        }
      }
    });
    
    // Сортуємо за часом і видаляємо найстаріші
    cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = Math.floor(cacheEntries.length / 2); // Видаляємо половину найстаріших
    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(cacheEntries[i].key);
    }
  }
};

