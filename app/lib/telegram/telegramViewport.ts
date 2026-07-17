/**
 * Viewport Telegram Mini App:
 * - мобільні: expand + fullscreen (як раніше);
 * - десктоп / веб Telegram: без expand/fullscreen — залишається у вікні клієнта.
 */

const MOBILE_PLATFORMS = new Set(['ios', 'android']);
const DESKTOP_PLATFORMS = new Set([
  'tdesktop',
  'macos',
  'windows',
  'linux',
  'weba',
  'webk',
  'web',
  'unigram',
]);

type TgLike = {
  platform?: string;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isFullscreen?: boolean;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
};

/** Telegram Desktop / Web / macOS — не розгортати на весь екран. */
export function isTelegramDesktopClient(tg?: TgLike | null): boolean {
  const platform = (tg?.platform || '').toLowerCase();
  if (MOBILE_PLATFORMS.has(platform)) return false;
  if (DESKTOP_PLATFORMS.has(platform)) return true;
  // unknown / порожній platform: на широкому екрані не форсуємо fullscreen
  if (typeof window !== 'undefined') {
    return window.matchMedia('(min-width: 900px)').matches;
  }
  return false;
}

/** Expand лише на мобільних (картка товару, таби тощо). */
export function expandTelegramViewportIfMobile(tg?: TgLike | null): void {
  if (!tg || isTelegramDesktopClient(tg)) return;
  try {
    tg.expand?.();
  } catch {
    /* ignore */
  }
}

/**
 * Готовність Mini App + viewport-режим залежно від платформи.
 * Викликати після завантаження telegram-web-app.js (клієнт).
 */
export function ensureTelegramViewportFullscreen(): void {
  if (typeof window === 'undefined') return;

  const tg = window.Telegram?.WebApp as TgLike | undefined;
  if (!tg) return;

  try {
    tg.ready?.();

    if (isTelegramDesktopClient(tg)) {
      // Комп-версія: виходимо з fullscreen, якщо вже увімкнений, і не expand-имо
      if (tg.isFullscreen && typeof tg.exitFullscreen === 'function') {
        try {
          tg.exitFullscreen();
        } catch {
          /* ignore */
        }
      }
      if (typeof tg.enableVerticalSwipes === 'function') {
        try {
          tg.enableVerticalSwipes();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    tg.expand?.();

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
