import { useEffect, useRef } from 'react';
import { useUser } from './useUser';

/**
 * Hook для періодичного оновлення активності користувача (heartbeat)
 * Оновлює активність кожну хвилину + при подіях, щоб «онлайн» на головній відповідав реальності
 */
export function useActivityHeartbeat() {
  const { profile } = useUser();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!profile?.telegramId) {
      return;
    }

    const telegramId = typeof profile.telegramId === 'string' 
      ? parseInt(profile.telegramId, 10) 
      : profile.telegramId;

    if (isNaN(telegramId)) {
      return;
    }

    // Функція для оновлення активності
    const updateActivity = async () => {
      try {
        // Перевіряємо, чи пройшло достатньо часу з останнього оновлення (мінімум 30 секунд)
        const now = Date.now();
        if (now - lastUpdateRef.current < 20_000) {
          return; // Не спамимо БД — мінімум 20 с між оновленнями
        }

        await fetch('/api/user/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId }),
        });
        
        lastUpdateRef.current = now;
      } catch (err) {
        // Тиха обробка помилок
        if (process.env.NODE_ENV === 'development') {
          console.log('Note: Could not update activity heartbeat:', err);
        }
      }
    };

    // Оновлюємо активність одразу при завантаженні
    updateActivity();

    intervalRef.current = setInterval(updateActivity, 60 * 1000);

    // Оновлюємо активність при взаємодії користувача зі сторінкою
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleUserActivity = () => {
      updateActivity();
    };

    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
    };
  }, [profile?.telegramId]);
}
