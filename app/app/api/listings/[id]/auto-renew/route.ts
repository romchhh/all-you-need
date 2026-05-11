import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureListingApiRawColumns } from '@/lib/prisma';

/**
 * Увімкнути / вимкнути автопродовження оголошення на +30 днів при закінченні expiresAt.
 * POST body: { telegramId: string, autoRenew: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureListingApiRawColumns();
    const listingId = parseInt((await params).id, 10);
    if (Number.isNaN(listingId)) {
      return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
    }

    const body = await request.json();
    const { telegramId, autoRenew } = body as {
      telegramId?: string;
      autoRenew?: boolean;
    };

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }
    if (typeof autoRenew !== 'boolean') {
      return NextResponse.json({ error: 'autoRenew must be a boolean' }, { status: 400 });
    }

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT l.id, l.status, CAST(u.telegramId AS INTEGER) as sellerTelegramId
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.id = ?`,
      listingId
    )) as Array<{ id: number; status: string; sellerTelegramId: number }>;

    if (!rows.length) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const row = rows[0];
    if (String(row.sellerTelegramId) !== String(telegramId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (row.status !== 'active') {
      return NextResponse.json(
        { error: 'Auto-renew is only available for active listings' },
        { status: 400 }
      );
    }

    const ar = autoRenew ? 1 : 0;
    await prisma.$executeRawUnsafe(
      `UPDATE Listing SET autoRenew = ?, updatedAt = datetime('now') WHERE id = ?`,
      ar,
      listingId
    );

    return NextResponse.json({ success: true, listingId, autoRenew });
  } catch (error) {
    console.error('[auto-renew]', error);
    return NextResponse.json({ error: 'Failed to update auto-renew' }, { status: 500 });
  }
}
