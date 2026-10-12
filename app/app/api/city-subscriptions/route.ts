import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCitySubscriptionTable } from '@/lib/prisma';
import { normalizeCityInput } from '@/lib/city/cityNormalization';
import { normalizeTelegramIdForDb, sqlUserTelegramIdWhere } from '@/lib/dbSql';
import { trackUserActivity } from '@/utils/trackActivity';

export const dynamic = 'force-dynamic';

let initPromise: Promise<void> | null = null;

async function ensureTable() {
  if (!initPromise) initPromise = ensureCitySubscriptionTable();
  await initPromise;
}

/** Telegram id лишається рядком: інакше PostgreSQL порівнює text = bigint і запит падає. */
async function resolveUserId(telegramId: string): Promise<number | null> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key || !/^\d+$/.test(key)) return null;

  const users = await executeWithRetry(
    () =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE ${sqlUserTelegramIdWhere()}`,
        key
      ) as Promise<Array<{ id: number }>>
  );
  return users[0]?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    await trackUserActivity(request);
    await ensureTable();

    const telegramId = request.nextUrl.searchParams.get('telegramId');
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const rows = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT cityKey FROM CitySubscription WHERE userId = ? ORDER BY cityKey ASC`,
        userId
      ) as Promise<Array<{ cityKey: string }>>
    );

    return NextResponse.json({ cities: rows.map((r) => r.cityKey) });
  } catch (error) {
    console.error('[city-subscriptions GET]', error);
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await trackUserActivity(request);
    await ensureTable();

    const body = await request.json();
    const telegramId = body.telegramId as string | number | undefined;
    const city = body.city as string | undefined;

    if (telegramId == null || telegramId === '' || !city || typeof city !== 'string') {
      return NextResponse.json(
        { error: 'telegramId and city are required' },
        { status: 400 }
      );
    }

    const cityKey = normalizeCityInput(city.trim());
    if (!cityKey) {
      return NextResponse.json({ error: 'Invalid city' }, { status: 400 });
    }

    const userId = await resolveUserId(String(telegramId));
    if (userId == null) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO CitySubscription (userId, cityKey, createdAt) VALUES (?, ?, datetime('now'))
         ON CONFLICT (userId, cityKey) DO NOTHING`,
        userId,
        cityKey
      )
    );

    return NextResponse.json({ success: true, cityKey });
  } catch (error) {
    console.error('[city-subscriptions POST]', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await trackUserActivity(request);
    await ensureTable();

    const telegramId = request.nextUrl.searchParams.get('telegramId');
    const city = request.nextUrl.searchParams.get('city');
    if (!telegramId || !city) {
      return NextResponse.json(
        { error: 'telegramId and city are required' },
        { status: 400 }
      );
    }

    const cityKey = normalizeCityInput(city.trim());
    if (!cityKey) {
      return NextResponse.json({ error: 'Invalid city' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM CitySubscription WHERE userId = ? AND cityKey = ?`,
        userId,
        cityKey
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[city-subscriptions DELETE]', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
