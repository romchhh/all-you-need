import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureCitySubscriptionTable } from '@/lib/prisma';
import { normalizeCityInput } from '@/lib/city/cityNormalization';
import { sqlNow } from '@/lib/dbSql';
import { trackUserActivity } from '@/utils/trackActivity';
import { findUserByTelegramId } from '@/utils/userHelpers';

export const dynamic = 'force-dynamic';

let initPromise: Promise<void> | null = null;

async function ensureTable() {
  if (!initPromise) initPromise = ensureCitySubscriptionTable();
  await initPromise;
}

async function resolveUserId(telegramId: string): Promise<number | null> {
  const user = await findUserByTelegramId(String(telegramId).trim());
  return user?.id ?? null;
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
      return NextResponse.json({ error: 'follower_not_found' }, { status: 404 });
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
    const telegramId =
      body.telegramId != null && String(body.telegramId).trim()
        ? String(body.telegramId).trim()
        : '';
    const city = typeof body.city === 'string' ? body.city : '';

    if (!telegramId || !city.trim()) {
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
      return NextResponse.json({ error: 'follower_not_found' }, { status: 404 });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO CitySubscription (userId, cityKey, createdAt) VALUES (?, ?, ${sqlNow()})
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
      return NextResponse.json({ error: 'follower_not_found' }, { status: 404 });
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
