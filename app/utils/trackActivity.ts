import { NextRequest } from 'next/server';
import { updateUserActivity } from '@/lib/prisma';
import { normalizeTelegramIdForDb } from '@/lib/dbSql';

/**
 * Оновлює активність користувача на основі telegramId з запиту
 * Використовується в API routes для автоматичного відстеження активності
 */
export async function trackUserActivity(request: NextRequest): Promise<void> {
  try {
    let telegramId: string | null = null;

    const queryTelegramId = request.nextUrl.searchParams.get('telegramId');
    if (queryTelegramId) {
      telegramId = normalizeTelegramIdForDb(queryTelegramId) || null;
    }

    if (!telegramId) {
      try {
        const contentType = request.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const body = await request.clone().json().catch(() => null);
          if (body?.telegramId != null) {
            telegramId = normalizeTelegramIdForDb(body.telegramId) || null;
          }
        }
      } catch {
        // ignore body parse errors
      }
    }

    if (!telegramId) {
      const headerTelegramId = request.headers.get('x-telegram-id');
      if (headerTelegramId) {
        telegramId = normalizeTelegramIdForDb(headerTelegramId) || null;
      }
    }

    // viewerId / userId у каталозі теж часто є telegram id
    if (!telegramId) {
      const viewerId = request.nextUrl.searchParams.get('viewerId');
      if (viewerId) {
        telegramId = normalizeTelegramIdForDb(viewerId) || null;
      }
    }

    if (telegramId) {
      await updateUserActivity(telegramId);
    }
  } catch (error) {
    console.error('[trackUserActivity]', error);
  }
}
