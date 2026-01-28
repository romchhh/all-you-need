import crypto from 'crypto';

/**
 * Валідує initData від Telegram WebApp
 * @param initData - рядок з параметрами від Telegram
 * @param botToken - токен бота
 * @returns true якщо дані валідні, false якщо ні
 */
export function validateTelegramWebAppData(initData: string, botToken: string): boolean {
  try {
    console.log('[Telegram Auth] Starting validation...');
    
    if (!initData || !botToken) {
      console.error('[Telegram Auth] Missing initData or botToken');
      console.error('[Telegram Auth] initData exists:', !!initData);
      console.error('[Telegram Auth] botToken exists:', !!botToken);
      return false;
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    console.log('[Telegram Auth] Parsed parameters:', Array.from(urlParams.keys()));
    
    if (!hash) {
      console.error('[Telegram Auth] No hash in initData');
      console.error('[Telegram Auth] Available parameters:', Array.from(urlParams.keys()).join(', '));
      return false;
    }

    urlParams.delete('hash');
    
    // Сортуємо параметри
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    console.log('[Telegram Auth] Data check string created, length:', dataCheckString.length);
    
    // Створюємо секретний ключ
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Перевіряємо хеш
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    const isValid = calculatedHash === hash;
    
    if (!isValid) {
      console.error('[Telegram Auth] ❌ Hash mismatch');
      console.error('[Telegram Auth] Expected hash:', hash);
      console.error('[Telegram Auth] Calculated hash:', calculatedHash);
      console.error('[Telegram Auth] Data check string:', dataCheckString.substring(0, 100) + '...');
    } else {
      console.log('[Telegram Auth] ✅ Hash validated successfully');
    }
    
    return isValid;
  } catch (error) {
    console.error('[Telegram Auth] Validation error:', error);
    return false;
  }
}

/**
 * Парсить дані користувача з initData
 */
export function parseTelegramUser(initData: string): {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
} | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    
    if (!userParam) {
      return null;
    }
    
    const user = JSON.parse(decodeURIComponent(userParam));
    return user;
  } catch (error) {
    console.error('[Telegram Auth] Error parsing user:', error);
    return null;
  }
}
