import { NextRequest, NextResponse } from 'next/server';
import { executeWithRetry, prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';
import {
  grantAdminPromotionForListing,
  isValidPromotionType,
} from '@/utils/paymentHelpers';
import type { PromotionType } from '@/utils/paymentConstants';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const listingId = parseInt(id, 10);
    if (isNaN(listingId)) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { promotionType, durationDays } = body;

    if (!promotionType || typeof promotionType !== 'string' || !isValidPromotionType(promotionType)) {
      return NextResponse.json(
        { error: 'Invalid or missing promotionType (highlighted, top_category, vip)' },
        { status: 400 }
      );
    }

    let days: number | undefined;
    if (durationDays !== undefined && durationDays !== null) {
      const n = Number(durationDays);
      if (isNaN(n)) {
        return NextResponse.json({ error: 'durationDays must be a number' }, { status: 400 });
      }
      days = n;
    }

    const rows = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT userId FROM Listing WHERE id = ?`,
        listingId
      ) as Promise<Array<{ userId: number }>>
    );

    if (!rows[0]) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const listingUserId = rows[0].userId;

    const { promotionEnds } = await grantAdminPromotionForListing(
      listingUserId,
      listingId,
      promotionType as PromotionType,
      days
    );

    return NextResponse.json({
      success: true,
      promotionEnds: promotionEnds.toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin grant-promotion]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to grant promotion' },
      { status: 500 }
    );
  }
}
