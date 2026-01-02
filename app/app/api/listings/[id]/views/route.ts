import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Перевіряємо чи користувач є власником оголошення
    const user = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      parseInt(userId)
    ) as Array<{ id: number }>;

    if (!user[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true },
    });

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.userId !== user[0].id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Отримуємо історію переглядів
    const viewHistory = await prisma.$queryRawUnsafe(
      `SELECT 
        viewedAt,
        userAgent,
        ipAddress
      FROM ViewHistory
      WHERE listingId = ?
      ORDER BY viewedAt DESC
      LIMIT 100`,
      listingId
    ) as Array<{
      viewedAt: string;
      userAgent: string | null;
      ipAddress: string | null;
    }>;

    return NextResponse.json({
      views: viewHistory.map(v => ({
        viewedAt: v.viewedAt,
        userAgent: v.userAgent,
        ipAddress: v.ipAddress,
      })),
    });
  } catch (error) {
    console.error('Error fetching view history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch view history' },
      { status: 500 }
    );
  }
}

