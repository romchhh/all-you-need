/**
 * Ініціалізація Telegram WebApp з автоматичним отриманням даних користувача
 * 
 * Цей модуль забезпечує надійне отримання даних користувача з Telegram WebApp,
 * навіть якщо initData не передається коректно.
 */

export interface TelegramInitResult {
  success: boolean;
  telegramId: number | null;
  userData: any | null;
  source: 'initDataUnsafe' | 'initDataString' | 'url' | 'sessionStorage' | 'none';
  error?: string;
}

/**
 * Ініціалізує Telegram WebApp і отримує дані користувача
 */
export function initializeTelegramWebApp(): TelegramInitResult {
  console.log('=== Initializing Telegram WebApp ===');
  
  // Перевіряємо наявність Telegram WebApp
  if (typeof window === 'undefined') {
    return {
      success: false,
      telegramId: null,
      userData: null,
      source: 'none',
      error: 'Window is undefined (SSR)'
    };
  }

  if (!window.Telegram?.WebApp) {
    console.warn('❌ Telegram WebApp not available');
    return {
      success: false,
      telegramId: null,
      userData: null,
      source: 'none',
      error: 'Telegram WebApp not available'
    };
  }

  const tg = window.Telegram.WebApp;
  
  // Викликаємо ready() для ініціалізації
  tg.ready();
  console.log('✅ Telegram WebApp ready() called');

  // 1. Спробуємо отримати з initDataUnsafe (найкращий варіант)
  if (tg.initDataUnsafe?.user?.id) {
    const user = tg.initDataUnsafe.user;
    console.log('✅ User data from initDataUnsafe:', user);
    
    // Зберігаємо в sessionStorage
    sessionStorage.setItem('telegramId', user.id.toString());
    sessionStorage.setItem('telegramUserData', JSON.stringify(user));
    
    return {
      success: true,
      telegramId: user.id,
      userData: user,
      source: 'initDataUnsafe'
    };
  }

  // 2. Спробуємо розпарсити initData string
  if (tg.initData && tg.initData.length > 0) {
    console.log('Trying to parse initData string...');
    const parsed = parseInitDataString(tg.initData);
    
    if (parsed.success && parsed.telegramId) {
      console.log('✅ User data from initData string:', parsed.telegramId);
      
      // Зберігаємо в sessionStorage
      sessionStorage.setItem('telegramId', parsed.telegramId.toString());
      if (parsed.userData) {
        sessionStorage.setItem('telegramUserData', JSON.stringify(parsed.userData));
      }
      
      return {
        success: true,
        telegramId: parsed.telegramId,
        userData: parsed.userData,
        source: 'initDataString'
      };
    }
  }

  // 3. Перевіряємо URL параметри
  const urlParams = new URLSearchParams(window.location.search);
  const telegramIdFromUrl = urlParams.get('telegramId');
  
  if (telegramIdFromUrl) {
    const id = parseInt(telegramIdFromUrl, 10);
    if (!isNaN(id)) {
      console.log('✅ telegramId from URL:', id);
      
      // Зберігаємо в sessionStorage
      sessionStorage.setItem('telegramId', id.toString());
      
      return {
        success: true,
        telegramId: id,
        userData: null,
        source: 'url'
      };
    }
  }

  // 4. Перевіряємо sessionStorage
  const storedId = sessionStorage.getItem('telegramId');
  const storedUserData = sessionStorage.getItem('telegramUserData');
  
  if (storedId) {
    const id = parseInt(storedId, 10);
    if (!isNaN(id)) {
      console.log('✅ telegramId from sessionStorage:', id);
      
      return {
        success: true,
        telegramId: id,
        userData: storedUserData ? JSON.parse(storedUserData) : null,
        source: 'sessionStorage'
      };
    }
  }

  // Нічого не знайдено
  console.error('❌ Could not get telegramId from any source');
  console.log('initData:', tg.initData);
  console.log('initDataUnsafe:', tg.initDataUnsafe);
  
  return {
    success: false,
    telegramId: null,
    userData: null,
    source: 'none',
    error: 'No telegramId found'
  };
}

/**
 * Парсить initData string для отримання даних користувача
 */
function parseInitDataString(initData: string): { success: boolean; telegramId: number | null; userData: any | null } {
  try {
    // initData має формат: user=%7B%22id%22%3A123456789%2C... (URL encoded JSON)
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    
    if (userParam) {
      const decoded = decodeURIComponent(userParam);
      const user = JSON.parse(decoded);
      
      if (user && user.id) {
        return {
          success: true,
          telegramId: user.id,
          userData: user
        };
      }
    }
    
    return {
      success: false,
      telegramId: null,
      userData: null
    };
  } catch (error) {
    console.error('Error parsing initData string:', error);
    return {
      success: false,
      telegramId: null,
      userData: null
    };
  }
}

/**
 * Отримує telegramId з будь-якого доступного джерела
 */
export function getTelegramId(): number | null {
  // Спробуємо отримати з різних джерел
  
  // 1. Telegram WebApp initDataUnsafe
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    return window.Telegram.WebApp.initDataUnsafe.user.id;
  }
  
  // 2. sessionStorage
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('telegramId');
    if (stored) {
      const id = parseInt(stored, 10);
      if (!isNaN(id)) return id;
    }
  }
  
  // 3. URL параметр
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const telegramIdFromUrl = urlParams.get('telegramId');
    if (telegramIdFromUrl) {
      const id = parseInt(telegramIdFromUrl, 10);
      if (!isNaN(id)) {
        // Зберігаємо для майбутнього використання
        sessionStorage.setItem('telegramId', id.toString());
        return id;
      }
    }
  }
  
  return null;
}
