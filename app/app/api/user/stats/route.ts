import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserListingStatsForUserId } from '@/lib/userBootstrapQueries';

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
    const createdAtRaw = users[0].createdAt as unknown;
    const created =
      createdAtRaw instanceof Date ? createdAtRaw.toISOString() : String(createdAtRaw);
    const payload = await getUserListingStatsForUserId(userId, created);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

