import { useEffect, useRef } from 'react';
import { TelegramWebApp } from '@/types/telegram';

interface UseSwipeBackOptions {
  onSwipeBack: () => void;
  enabled?: boolean;
  threshold?: number; // Мінімальна відстань свайпу в пікселях
  maxVerticalDistance?: number; // Максимальна вертикальна відстань для горизонтального свайпу
  tg?: TelegramWebApp | null; // Telegram WebApp для вібрації
}

export const useSwipeBack = ({
  onSwipeBack,
  enabled = true,
  threshold = 50,
  maxVerticalDistance = 30,
  tg
}: UseSwipeBackOptions) => {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Перевіряємо, чи початок свайпу з лівого краю екрану (в межах 20px)
      const touch = e.touches[0];
      if (touch.clientX <= 20) {
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
      } else {
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const touch = e.touches[0];
      touchEndX.current = touch.clientX;
      touchEndY.current = touch.clientY;
    };

    const handleTouchEnd = () => {
      if (touchStartX.current === null || touchEndX.current === null) {
        touchStartX.current = null;
        touchStartY.current = null;
        touchEndX.current = null;
        touchEndY.current = null;
        return;
      }

      const deltaX = touchEndX.current - touchStartX.current;
      const deltaY = Math.abs((touchEndY.current || 0) - (touchStartY.current || 0));

      // Перевіряємо, чи це горизонтальний свайп (вертикальна відстань менша за maxVerticalDistance)
      if (deltaY > maxVerticalDistance) {
        // Це вертикальний свайп, ігноруємо
        touchStartX.current = null;
        touchStartY.current = null;
        touchEndX.current = null;
        touchEndY.current = null;
        return;
      }

      // Свайп вправо (зліва направо) для повернення назад
      if (deltaX > threshold) {
        tg?.HapticFeedback?.impactOccurred('medium');
        onSwipeBack();
      }

      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      touchEndY.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, maxVerticalDistance, onSwipeBack, tg]);
};

