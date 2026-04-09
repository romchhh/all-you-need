/**
 * Утиліта для генерації посилань на бота
 */

/**
 * Отримує базове посилання на бота
 */
export const getBotBaseUrl = (): string => {
  const botUrl = process.env.NEXT_PUBLIC_BOT_URL;
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME;
  
  if (botUrl) {
    // Видаляємо trailing slash якщо є
    return botUrl.replace(/\/$/, '');
  }
  
  if (botUsername) {
    return `https://t.me/${botUsername}`;
  }
  
  // Fallback для розробки
  console.warn('NEXT_PUBLIC_BOT_URL or NEXT_PUBLIC_BOT_USERNAME not configured');
  return 'https://t.me/your_bot';
};

/**
 * Посилання для Telegram WebApp.openTelegramLink — лише t.me / telegram.me.
 */
export const getBotTelegramOpenUrl = (): string => {
  const raw = getBotBaseUrl().trim();
  if (/^https:\/\/(t\.me|telegram\.me)\//i.test(raw)) {
    return raw;
  }
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME;
  if (botUsername) {
    return `https://t.me/${botUsername.replace(/^@/, '')}`;
  }
  return raw.startsWith('http') ? raw : `https://t.me/${raw.replace(/^@/, '')}`;
};

/**
 * Генерує посилання на бота з параметром start
 */
export const getBotStartLink = (startParam: string): string => {
  const baseUrl = getBotBaseUrl();
  return `${baseUrl}?start=${startParam}`;
};

/**
 * Генерує посилання для поділу профілю
 */
export const getProfileShareLink = (telegramId: string | number): string => {
  return getBotStartLink(`user_${telegramId}`);
};

/**
 * Генерує посилання для поділу оголошення
 */
export const getListingShareLink = (listingId: number): string => {
  return getBotStartLink(`listing_${listingId}`);
};

