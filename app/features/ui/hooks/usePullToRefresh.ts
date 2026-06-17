import { useEffect, useRef, useState, useCallback } from 'react';
import { TelegramWebApp } from '@/types/telegram';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  threshold?: number; // Мінімальна відстань для активації pull-to-refresh
  maxDistance?: number; // Максимальна відстань тягнення
  resistance?: number; // Коефіцієнт опору (0-1, менше = більше опору)
  tg?: TelegramWebApp | null;
}

export const usePullToRefresh = ({
  onRefresh,
  enabled = false, // Вимкнено за замовчуванням
  threshold = 80,
  maxDistance = 150,
  resistance = 0.5,
  tg
}: UsePullToRefreshOptions) => {
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const hasVibratedThreshold = useRef(false);
  const hasVibratedStart = useRef(false);

  // Функція для розрахунку rubber band ефекту
  const applyRubberBandEffect = useCallback((distance: number): number => {
    if (distance <= threshold) {
      // До порогу - лінійне збільшення
      return distance;
    }
    // Після порогу - rubber band ефект
    const extraDistance = distance - threshold;
    const rubberBandDistance = threshold + (extraDistance * resistance);
    return Math.min(rubberBandDistance, maxDistance);
  }, [threshold, maxDistance, resistance]);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Перевіряємо, чи користувач на початку сторінки
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      
      // Дозволяємо pull-to-refresh тільки якщо на самому верху
      if (scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        touchCurrentY.current = e.touches[0].clientY;
        hasVibratedStart.current = false;
        hasVibratedThreshold.current = false;
      } else {
        touchStartY.current = null;
        touchCurrentY.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null || isRefreshingRef.current) return;
      
      const currentScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      
      // Якщо скрол не на початку - виходимо
      if (currentScroll > 0) {
        touchStartY.current = null;
        touchCurrentY.current = null;
        setIsPulling(false);
        setPullDistance(0);
        hasVibratedStart.current = false;
        hasVibratedThreshold.current = false;
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
        
        // Застосовуємо rubber band ефект (простий розрахунок)
        const rubberBandDistance = applyRubberBandEffect(deltaY);
        setPullDistance(rubberBandDistance);
        
        // Легка вібрація на початку тягнення (один раз)
        if (deltaY > 20 && deltaY < 30 && !hasVibratedStart.current) {
          hasVibratedStart.current = true;
          tg?.HapticFeedback?.impactOccurred('soft');
        }
        
        // Вібрація при досягненні порогу (тільки один раз)
        if (rubberBandDistance >= threshold && !hasVibratedThreshold.current) {
          hasVibratedThreshold.current = true;
          tg?.HapticFeedback?.impactOccurred('medium');
        }
      } else {
        // Якщо свайп вгору - скидаємо стан
        setIsPulling(false);
        setPullDistance(0);
        hasVibratedStart.current = false;
        hasVibratedThreshold.current = false;
      }
    };

    const handleTouchEnd = async () => {
      if (touchStartY.current === null || touchCurrentY.current === null) {
        touchStartY.current = null;
        touchCurrentY.current = null;
        setIsPulling(false);
        setPullDistance(0);
        hasVibratedStart.current = false;
        hasVibratedThreshold.current = false;
        return;
      }

      const currentDistance = pullDistance;
      const deltaY = touchCurrentY.current - touchStartY.current;
      const finalDistance = deltaY > 0 ? applyRubberBandEffect(deltaY) : 0;

      // Якщо відстань достатня для оновлення
      if (finalDistance >= threshold && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        
        // Анімуємо до фіксованої позиції
        setPullDistance(threshold);
        tg?.HapticFeedback?.impactOccurred('heavy');
        
        try {
          await onRefresh();
          // Успішна вібрація
          tg?.HapticFeedback?.notificationOccurred('success');
        } catch (error) {
          console.error('Error refreshing:', error);
          tg?.HapticFeedback?.notificationOccurred('error');
        } finally {
          // Плавно повертаємо до початкового стану
          setTimeout(() => {
            setIsRefreshing(false);
            setIsPulling(false);
            setPullDistance(0);
            isRefreshingRef.current = false;
            hasVibratedStart.current = false;
            hasVibratedThreshold.current = false;
          }, 300);
        }
      } else {
        // Швидко повертаємо до початкового стану
        setIsPulling(false);
        setPullDistance(0);
        hasVibratedStart.current = false;
        hasVibratedThreshold.current = false;
      }

      touchStartY.current = null;
      touchCurrentY.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, threshold, onRefresh, tg, applyRubberBandEffect]);

  return {
    isPulling,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
    isRefreshing
  };
};

