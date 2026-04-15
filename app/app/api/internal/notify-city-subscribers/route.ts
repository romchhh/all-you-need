import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyCitySubscribersOfNewMarketplaceListing } from '@/utils/citySubscriptionNotifications';

export const dynamic = 'force-dynamic';

/**
 * Виклик з Python-бота після схвалення оголошення маркетплейсу в групі модерації
 * (той самий ефект, що notify у approveListing у Next.js).
 *
 * POST { listingId: number }
 * Authorization: Bearer BOT_API_KEY | INTERNAL_API_SECRET | CRON_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const secret =
      process.env.BOT_API_KEY ||
      process.env.TELEGRAM_BOT_API_KEY ||
      process.env.INTERNAL_API_SECRET ||
      process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const listingId = Number(body.listingId);
    if (!Number.isFinite(listingId) || listingId < 1) {
      return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    }

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT l.id, l.userId, l.title, l.location FROM Listing l WHERE l.id = ?`,
      listingId
    )) as Array<{
      id: number;
      userId: number;
      title: string;
      location: string | null;
    }>;

    if (!rows[0]) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const l = rows[0];
    await notifyCitySubscribersOfNewMarketplaceListing({
      listingId: l.id,
      userId: l.userId,
      title: l.title,
      location: l.location || '',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[internal/notify-city-subscribers]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
