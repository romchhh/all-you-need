import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { submitListingToModeration } from '@/utils/listingHelpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const { telegramId } = await request.json();

    // Знаходимо користувача (telegramId - це BIGINT, тому використовуємо TEXT для порівняння)
    const users = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS TEXT) = ?`,
      String(telegramId)
    ) as Array<{ id: number }>;

    if (!users[0]) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Перевіряємо оголошення
    const listings = await prisma.$queryRawUnsafe(
      `SELECT userId, status FROM Listing WHERE id = ?`,
      listingId
    ) as Array<{ userId: number; status: string }>;

    if (listings.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const listing = listings[0];

    // Перевіряємо власника
    if (listing.userId !== users[0].id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Перевіряємо статус
    if (listing.status === 'active') {
      return NextResponse.json(
        { error: 'Listing is already active' },
        { status: 400 }
      );
    }

    // Якщо статус вже pending_moderation, просто відправляємо в ТГ групу
    // (це може статися після оплати реклами з балансу)
    if (listing.status === 'pending_moderation') {
      console.log('[Submit Moderation] Listing already pending_moderation, sending to TG group');
      await submitListingToModeration(listingId);
      return NextResponse.json({
        success: true,
        message: 'Listing sent to moderation group',
      });
    }

    // Для відхилених оголошень очищаємо причину відхилення перед відправкою на модерацію
    if (listing.status === 'rejected') {
      console.log('[Submit Moderation] Rejected listing - clearing rejection reason before moderation');
      const { nowSQLite } = await import('@/utils/dateHelpers');
      const nowStr = nowSQLite();
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET rejectionReason = NULL, updatedAt = ? WHERE id = ?`,
        nowStr,
        listingId
      );
    }

    // Відправляємо на модерацію (змінює статус на pending_moderation)
    await submitListingToModeration(listingId);

    return NextResponse.json({
      success: true,
      message: 'Listing submitted for moderation',
    });
  } catch (error) {
    console.error('[Submit Moderation] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit listing for moderation' },
      { status: 500 }
    );
  }
}
