'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ensureTelegramViewportFullscreen } from '@/utils/telegramViewport';

/**
 * Гарантує ready + expand (+ fullscreen / swipe lock) на кожній сторінці навігації,
 * навіть якщо сторінка не викликає useTelegram().
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
      if (tg.isExpanded === false) {
        try {
          tg.expand();
        } catch {
          /* ignore */
        }
      }
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
