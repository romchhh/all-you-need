import { useEffect, useRef, useState } from 'react';
import { TelegramWebApp } from '@/types/telegram';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  threshold?: number; // Мінімальна відстань для активації pull-to-refresh
  tg?: TelegramWebApp | null;
}

export const usePullToRefresh = ({
  onRefresh,
  enabled = true,
  threshold = 80,
  tg
}: UsePullToRefreshOptions) => {
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const isRefreshing = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Перевіряємо, чи користувач на початку сторінки
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollTop <= 10) {
        touchStartY.current = e.touches[0].clientY;
        touchCurrentY.current = e.touches[0].clientY;
      } else {
        touchStartY.current = null;
        touchCurrentY.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null) return;
      
      // Перевіряємо, чи все ще на початку сторінки
      const currentScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (currentScroll > 10) {
        touchStartY.current = null;
        touchCurrentY.current = null;
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      touchCurrentY.current = e.touches[0].clientY;
      const deltaY = touchCurrentY.current - touchStartY.current;

      // Дозволяємо pull-to-refresh тільки якщо свайп вниз
      if (deltaY > 0) {
        // Запобігаємо стандартному скролу під час pull-to-refresh
        if (deltaY > 5) {
          e.preventDefault();
        }
        setIsPulling(true);
        setPullDistance(Math.min(deltaY, threshold * 1.5));
        
        // Вібрація при досягненні порогу (тільки один раз)
        if (deltaY >= threshold && !isRefreshing.current && deltaY < threshold + 10) {
          tg?.HapticFeedback?.impactOccurred('light');
        }
      } else {
        setIsPulling(false);
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (touchStartY.current === null || touchCurrentY.current === null) {
        touchStartY.current = null;
        touchCurrentY.current = null;
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      const deltaY = touchCurrentY.current - touchStartY.current;

      // Якщо свайп достатньо великий, викликаємо оновлення
      if (deltaY >= threshold && !isRefreshing.current) {
        isRefreshing.current = true;
        setIsPulling(true);
        setPullDistance(threshold);
        tg?.HapticFeedback?.impactOccurred('medium');
        
        try {
          await onRefresh();
        } catch (error) {
          console.error('Error refreshing:', error);
        } finally {
          // Плавно повертаємо до початкового стану
          setTimeout(() => {
            setIsPulling(false);
            setPullDistance(0);
            isRefreshing.current = false;
          }, 300);
        }
      } else {
        // Плавно повертаємо до початкового стану
        setIsPulling(false);
        setPullDistance(0);
      }

      touchStartY.current = null;
      touchCurrentY.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, onRefresh, tg]);

  return {
    isPulling,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1)
  };
};

