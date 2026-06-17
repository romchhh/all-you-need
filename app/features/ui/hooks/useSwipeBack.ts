import { useEffect, useRef } from 'react';
import { TelegramWebApp } from '@/types/telegram';

interface UseSwipeBackOptions {
  onSwipeBack: () => void;
  onSwipeProgress?: (progress: number) => void; // Прогрес свайпу (0-100)
  enabled?: boolean;
  threshold?: number; // Мінімальна відстань свайпу в пікселях
  maxVerticalDistance?: number; // Максимальна вертикальна відстань для горизонтального свайпу
  tg?: TelegramWebApp | null; // Telegram WebApp для вібрації
}

export const useSwipeBack = ({
  onSwipeBack,
  onSwipeProgress,
  enabled = true,
  threshold = 100,
  maxVerticalDistance = 50,
  tg
}: UseSwipeBackOptions) => {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
      
      // Обчислюємо прогрес свайпу для візуального ефекту
      if (onSwipeProgress && touchStartX.current !== null) {
        const deltaX = touch.clientX - touchStartX.current;
        const deltaY = Math.abs((touch.clientY || 0) - (touchStartY.current || 0));
        
        // Перевіряємо, чи це горизонтальний свайп (вертикальна відстань має бути меншою)
        // Якщо вертикальний рух більший - це скрол, не чіпаємо його
        if (deltaX > Math.abs(deltaY) && deltaY <= maxVerticalDistance && deltaX > 0) {
          // Використовуємо easing функцію для плавнішого прогресу
          const rawProgress = deltaX / threshold;
          // Застосовуємо cubic-bezier easing для більш природного руху
          const easedProgress = rawProgress < 1 
            ? rawProgress * rawProgress * (3 - 2 * rawProgress) // smoothstep
            : 1;
          const progress = Math.min(easedProgress * 100, 120); // Дозволяємо трохи перевищити для ефекту
          onSwipeProgress(progress);
        } else {
          // Вертикальний скрол - скидаємо прогрес і не заважаємо
          onSwipeProgress(0);
        }
      }
    };

    const handleTouchEnd = () => {
      if (onSwipeProgress) {
        onSwipeProgress(0);
      }
      
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
        // Плавна анімація перед закриттям
        if (onSwipeProgress) {
          onSwipeProgress(120);
          setTimeout(() => {
            onSwipeBack();
          }, 200);
        } else {
        onSwipeBack();
        }
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (onSwipeProgress) {
        onSwipeProgress(0);
      }
    };
  }, [enabled, threshold, maxVerticalDistance, onSwipeBack, onSwipeProgress, tg]);
};

