import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureFavoriteTable } from '@/lib/prisma';
import { normalizeTelegramIdForDb, sqlUserTelegramIdWhere } from '@/lib/dbSql';
import { trackUserActivity } from '@/utils/trackActivity';

let favoriteTableInitPromise: Promise<void> | null = null;

async function ensureFavoriteReady() {
  if (!favoriteTableInitPromise) {
    favoriteTableInitPromise = ensureFavoriteTable();
  }
  await favoriteTableInitPromise;
}

/** Telegram id лишається рядком: інакше PostgreSQL порівнює text = bigint і запит падає. */
async function resolveUserId(telegramId: string | number): Promise<number | null> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key || !/^\d+$/.test(key)) return null;

  const users = await executeWithRetry(
    () =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE ${sqlUserTelegramIdWhere()}`,
        key
      ) as Promise<Array<{ id: number }>>
  );
  return users[0]?.id != null ? Number(users[0].id) : null;
}

/** Отримати всі favorites користувача */
export async function GET(request: NextRequest) {
  try {
    await trackUserActivity(request);

    const telegramId = request.nextUrl.searchParams.get('telegramId');
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    await ensureFavoriteReady();

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ favorites: [] });
    }

    const favorites = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          `SELECT listingId FROM Favorite WHERE userId = ?`,
          userId
        ) as Promise<Array<{ listingId: number }>>
    );

    const favoriteIds = favorites
      .map((f) => Number(f.listingId))
      .filter((id) => Number.isFinite(id) && id > 0);

    return NextResponse.json({ favorites: favoriteIds });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

/** Додати favorite */
export async function POST(request: NextRequest) {
  try {
    await trackUserActivity(request);
    const body = await request.json();
    const { telegramId, listingId } = body;

    if (telegramId == null || listingId == null) {
      return NextResponse.json(
        { error: 'telegramId and listingId are required' },
        { status: 400 }
      );
    }

    await ensureFavoriteReady();

    const listingIdNum = Number(listingId);
    if (!Number.isFinite(listingIdNum) || listingIdNum <= 0) {
      return NextResponse.json({ error: 'Invalid listingId' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const existing = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          `SELECT id FROM Favorite WHERE userId = ? AND listingId = ?`,
          userId,
          listingIdNum
        ) as Promise<Array<{ id: number }>>
    );

    if (existing.length > 0) {
      return NextResponse.json({ success: true, message: 'Already favorited' });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO Favorite (userId, listingId, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        userId,
        listingIdNum
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as { message?: string };
    console.error('Error adding favorite:', err);
    if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
      return NextResponse.json({ success: true, message: 'Already favorited' });
    }
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

/** Видалити favorite */
export async function DELETE(request: NextRequest) {
  try {
    await trackUserActivity(request);

    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');
    const listingId = searchParams.get('listingId');

    if (!telegramId || !listingId) {
      return NextResponse.json(
        { error: 'telegramId and listingId are required' },
        { status: 400 }
      );
    }

    await ensureFavoriteReady();

    const listingIdNum = Number(listingId);
    if (!Number.isFinite(listingIdNum) || listingIdNum <= 0) {
      return NextResponse.json({ error: 'Invalid listingId' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ success: true });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM Favorite WHERE userId = ? AND listingId = ?`,
        userId,
        listingIdNum
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
