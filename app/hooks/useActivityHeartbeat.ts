import { useEffect, useRef } from 'react';
import { useUser } from './useUser';

/**
 * Hook для періодичного оновлення активності користувача (heartbeat)
 * Оновлює активність кожні 2 хвилини, коли користувач активний на сторінці
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
        if (now - lastUpdateRef.current < 30000) {
          return; // Не оновлюємо занадто часто
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

    // Оновлюємо активність кожні 2 хвилини
    intervalRef.current = setInterval(updateActivity, 2 * 60 * 1000);

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
