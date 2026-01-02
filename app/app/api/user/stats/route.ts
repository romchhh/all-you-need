import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);

    // Знаходимо користувача
    const users = await prisma.$queryRawUnsafe(
      `SELECT id, createdAt FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{ id: number; createdAt: string }>;

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;
    const createdAt = users[0].createdAt;

    // Отримуємо статистику
    const stats = await prisma.$queryRawUnsafe(
      `SELECT 
        COUNT(*) as totalListings,
        SUM(views) as totalViews,
        SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as soldListings,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeListings
      FROM Listing
      WHERE userId = ?`,
      userId
    ) as Array<{
      totalListings: bigint;
      totalViews: bigint;
      soldListings: bigint;
      activeListings: bigint;
    }>;

    const stat = stats[0] || {
      totalListings: BigInt(0),
      totalViews: BigInt(0),
      soldListings: BigInt(0),
      activeListings: BigInt(0),
    };

    return NextResponse.json({
      totalListings: Number(stat.totalListings),
      totalViews: Number(stat.totalViews),
      soldListings: Number(stat.soldListings),
      activeListings: Number(stat.activeListings),
      createdAt: createdAt,
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

