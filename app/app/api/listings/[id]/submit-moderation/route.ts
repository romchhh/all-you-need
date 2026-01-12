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

    // Знаходимо користувача
    const users = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      parseInt(telegramId)
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

    // Перевіряємо статус - не дозволяємо відправляти на модерацію вже активні або вже на модерації оголошення
    if (listing.status === 'active' || listing.status === 'pending_moderation') {
      return NextResponse.json(
        { error: 'Listing is already active or pending moderation' },
        { status: 400 }
      );
    }

    // Відправляємо на модерацію
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
