/**
 * Viewport Telegram Mini App:
 * - мобільні (ios / android / android_x): expand + fullscreen;
 * - десктоп / веб / macOS / будь-що інше: без expand/fullscreen.
 */

const MOBILE_PLATFORMS = new Set(['ios', 'android', 'android_x']);

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

/** Чи це мобільний клієнт Telegram (єдиний випадок для fullscreen). */
export function isTelegramMobileClient(tg?: TgLike | null): boolean {
  const platform = (tg?.platform || '').toLowerCase().trim();
  return MOBILE_PLATFORMS.has(platform);
}

/** Telegram Desktop / Web / macOS / unknown — не розгортати на весь екран. */
export function isTelegramDesktopClient(tg?: TgLike | null): boolean {
  return !isTelegramMobileClient(tg);
}

function exitDesktopFullscreen(tg: TgLike): void {
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
}

/** Expand лише на мобільних (картка товару, таби тощо). */
export function expandTelegramViewportIfMobile(tg?: TgLike | null): void {
  if (!tg || !isTelegramMobileClient(tg)) return;
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

    // Комп / веб: ніколи не expand і не requestFullscreen
    if (!isTelegramMobileClient(tg)) {
      exitDesktopFullscreen(tg);
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
