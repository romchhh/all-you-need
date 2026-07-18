'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  ensureTelegramViewportFullscreen,
  expandTelegramViewportIfMobile,
  isTelegramMobileClient,
} from '@/lib/telegram/telegramViewport';

/**
 * Готовність Mini App + viewport на кожній сторінці.
 * Fullscreen лише на мобільних (ios/android); на десктопі — ні.
 */
export function TelegramMiniAppViewport() {
  const pathname = usePathname();

  useEffect(() => {
    ensureTelegramViewportFullscreen();
  }, [pathname]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.onEvent) return;

    const onViewport = () => {
      // Десктоп: якщо клієнт сам увімкнув fullscreen — виходимо
      if (!isTelegramMobileClient(tg)) {
        if (tg.isFullscreen && typeof tg.exitFullscreen === 'function') {
          try {
            tg.exitFullscreen();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      expandTelegramViewportIfMobile(tg);

      if (typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('8.0')) {
        if (tg.isFullscreen === false && typeof tg.requestFullscreen === 'function') {
          try {
            tg.requestFullscreen();
          } catch {
            /* ignore */
          }
        }
      }
    };

    tg.onEvent('viewportChanged', onViewport);
    return () => {
      tg.offEvent?.('viewportChanged', onViewport);
    };
  }, []);

  return null;
}
