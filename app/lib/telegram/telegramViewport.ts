/**
 * Максимальне використання висоти / повноекранний режим Telegram Mini App на всіх сторінках.
 * Викликати після завантаження telegram-web-app.js (клієнт).
 */
export function ensureTelegramViewportFullscreen(): void {
  if (typeof window === 'undefined') return;

  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();

    // Зменшує конфлікт жестів зі згортанням шита (Bot API 7.7+)
    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }

    // Справжній fullscreen без верхньої/нижньої панелі Telegram (Bot API 8.0+)
    const supportsV8 =
      typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('8.0');
    if (supportsV8 && typeof tg.requestFullscreen === 'function') {
      tg.requestFullscreen();
      if (typeof tg.setHeaderColor === 'function') {
        try {
          tg.setHeaderColor('secondary_bg_color');
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.warn('[ensureTelegramViewportFullscreen]', e);
  }
}
