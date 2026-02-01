import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdAndActive } from '@/utils/userHelpers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId, 10);
    if (isNaN(telegramIdNum)) {
      return NextResponse.json({ error: 'Invalid telegramId' }, { status: 400 });
    }
    const u = await getUserIdAndActive(telegramIdNum);
    if (!u) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!u.isActive) {
      return NextResponse.json({ error: 'blocked' }, { status: 403 });
    }

    const user = [{ id: u.userId }];

    const listing = await prisma.$queryRawUnsafe(
      `SELECT userId FROM Listing WHERE id = ?`,
      listingId
    ) as Array<{ userId: number }>;

    if (!listing[0]) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing[0].userId !== user[0].id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Видаляємо оголошення
    await prisma.$executeRawUnsafe(
      `DELETE FROM Listing WHERE id = ?`,
      listingId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting listing:', error);
    return NextResponse.json(
      { error: 'Failed to delete listing' },
      { status: 500 }
    );
  }
}

