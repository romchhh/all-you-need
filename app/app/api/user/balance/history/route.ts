import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Отримати історію балансу
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'Telegram ID is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);
    const users = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{ id: number }>;

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;

    // Отримуємо транзакції
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.transaction.count({
      where: { userId },
    });

    return NextResponse.json({
      transactions,
      total,
      hasMore: offset + transactions.length < total,
    });
  } catch (error) {
    console.error('Error fetching balance history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance history' },
      { status: 500 }
    );
  }
}
