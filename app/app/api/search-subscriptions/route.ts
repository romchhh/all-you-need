import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureSearchSubscriptionTable } from '@/lib/prisma';
import { trackUserActivity } from '@/utils/trackActivity';
import { findUserByTelegramId } from '@/utils/userHelpers';
import { sqlNow } from '@/lib/dbSql';
import { normalizeQueryKey } from '@/lib/search/normalizeQueryKey';

export const dynamic = 'force-dynamic';

const MIN_QUERY_LENGTH = 2;

async function ensureTable() {
  await ensureSearchSubscriptionTable();
}

function isDuplicateSubscriptionError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || '').toLowerCase();
  return msg.includes('unique') || msg.includes('duplicate');
}

function normalizeEntityMode(raw: string | null | undefined): 'listings' | 'businesses' {
  return raw === 'businesses' ? 'businesses' : 'listings';
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
    const query = request.nextUrl.searchParams.get('query');
    const mode = normalizeEntityMode(request.nextUrl.searchParams.get('mode'));

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ error: 'follower_not_found' }, { status: 404 });
    }

    if (!query) {
      const rows = await executeWithRetry(
        () =>
          prisma.$queryRawUnsafe(
            `SELECT queryKey, queryText, entityMode FROM SearchSubscription WHERE userId = ? ORDER BY createdAt DESC`,
            userId
          ) as Promise<Array<{ queryKey: string; queryText: string; entityMode: string }>>
      );
      return NextResponse.json({
        subscriptions: rows.map((r) => ({
          queryKey: r.queryKey,
          queryText: r.queryText,
          mode: r.entityMode,
        })),
      });
    }

    const queryKey = normalizeQueryKey(query);
    if (queryKey.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const rows = await executeWithRetry(
      () =>
        prisma.$queryRawUnsafe(
          `SELECT id FROM SearchSubscription WHERE userId = ? AND queryKey = ? AND entityMode = ? LIMIT 1`,
          userId,
          queryKey,
          mode
        ) as Promise<Array<{ id: number }>>
    );

    return NextResponse.json({ subscribed: rows.length > 0, queryKey, mode });
  } catch (error) {
    console.error('[search-subscriptions GET]', error);
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
    const query = typeof body.query === 'string' ? body.query : '';
    const mode = normalizeEntityMode(body.mode as string | undefined);

    if (!telegramId || !query.trim()) {
      return NextResponse.json(
        { error: 'telegramId and query are required' },
        { status: 400 }
      );
    }

    const queryText = query.trim().replace(/\s+/g, ' ');
    const queryKey = normalizeQueryKey(queryText);
    if (queryKey.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ error: 'follower_not_found' }, { status: 404 });
    }

    // Без ON CONFLICT: на старій PG-таблиці унікального ключа може не бути, і INSERT падав.
    try {
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `INSERT INTO SearchSubscription (userId, queryKey, queryText, entityMode, createdAt)
           SELECT ?, ?, ?, ?, ${sqlNow()}
           WHERE NOT EXISTS (
             SELECT 1 FROM SearchSubscription
             WHERE userId = ? AND queryKey = ? AND entityMode = ?
           )`,
          userId,
          queryKey,
          queryText,
          mode,
          userId,
          queryKey,
          mode
        )
      );
    } catch (error) {
      if (!isDuplicateSubscriptionError(error)) throw error;
    }

    return NextResponse.json({ success: true, queryKey, mode, subscribed: true });
  } catch (error) {
    console.error('[search-subscriptions POST]', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await trackUserActivity(request);
    await ensureTable();

    const telegramId = request.nextUrl.searchParams.get('telegramId');
    const query = request.nextUrl.searchParams.get('query');
    const mode = normalizeEntityMode(request.nextUrl.searchParams.get('mode'));

    if (!telegramId || !query) {
      return NextResponse.json(
        { error: 'telegramId and query are required' },
        { status: 400 }
      );
    }

    const queryKey = normalizeQueryKey(query);
    if (queryKey.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const userId = await resolveUserId(telegramId);
    if (userId == null) {
      return NextResponse.json({ error: 'follower_not_found' }, { status: 404 });
    }

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM SearchSubscription WHERE userId = ? AND queryKey = ? AND entityMode = ?`,
        userId,
        queryKey,
        mode
      )
    );

    return NextResponse.json({ success: true, subscribed: false });
  } catch (error) {
    console.error('[search-subscriptions DELETE]', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
