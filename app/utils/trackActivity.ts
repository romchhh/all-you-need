import { NextRequest } from 'next/server';
import { updateUserActivity } from '@/lib/prisma';

/**
 * Оновлює активність користувача на основі telegramId з запиту
 * Використовується в API routes для автоматичного відстеження активності
 */
export async function trackUserActivity(request: NextRequest): Promise<void> {
  try {
    // Спробуємо отримати telegramId з різних джерел
    let telegramId: string | number | null = null;

    // 1. З query параметрів
    const queryTelegramId = request.nextUrl.searchParams.get('telegramId');
    if (queryTelegramId) {
      const parsed = parseInt(queryTelegramId, 10);
      if (!isNaN(parsed)) {
        telegramId = parsed;
      }
    }

    // 2. З body (для POST/PUT запитів)
    if (!telegramId) {
      try {
        const contentType = request.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const body = await request.clone().json().catch(() => null);
          if (body?.telegramId) {
            const parsed = typeof body.telegramId === 'number' 
              ? body.telegramId 
              : parseInt(body.telegramId, 10);
            if (!isNaN(parsed)) {
              telegramId = parsed;
            }
          }
        }
      } catch (err) {
        // Ігноруємо помилки парсингу body
      }
    }

    // 3. З headers (якщо передається в заголовках)
    if (!telegramId) {
      const headerTelegramId = request.headers.get('x-telegram-id');
      if (headerTelegramId) {
        const parsed = parseInt(headerTelegramId, 10);
        if (!isNaN(parsed)) {
          telegramId = parsed;
        }
      }
    }

    // Оновлюємо активність якщо знайшли telegramId
    if (telegramId) {
      await updateUserActivity(telegramId);
    }
  } catch (error) {
    // Тиха обробка помилок - не блокуємо запит
    if (process.env.NODE_ENV === 'development') {
      console.log('Note: Could not track user activity:', error);
    }
  }
}
