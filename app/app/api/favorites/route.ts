import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry, ensureFavoriteTable } from '@/lib/prisma';

// Глобальна змінна для відстеження ініціалізації таблиці Favorite
let favoriteTableInitPromise: Promise<void> | null = null;

// Отримати всі favorites користувача
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

    // Перевіряємо та створюємо таблицю Favorite тільки один раз
    if (!favoriteTableInitPromise) {
      favoriteTableInitPromise = ensureFavoriteTable();
    }
    await favoriteTableInitPromise;

    const telegramIdNum = parseInt(telegramId);

    // Знаходимо користувача
    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
        telegramIdNum
      ) as Promise<Array<{ id: number }>>
    );

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;

    // Отримуємо всі favorites користувача
    const favorites = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT listingId FROM Favorite WHERE userId = ?`,
        userId
      ) as Promise<Array<{ listingId: number }>>
    );

    const favoriteIds = favorites.map(f => f.listingId);

    return NextResponse.json({ favorites: favoriteIds });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch favorites' },
      { status: 500 }
    );
  }
}

// Додати favorite
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId, listingId } = body;

    if (!telegramId || !listingId) {
      return NextResponse.json(
        { error: 'telegramId and listingId are required' },
        { status: 400 }
      );
    }

    // Перевіряємо та створюємо таблицю Favorite тільки один раз
    if (!favoriteTableInitPromise) {
      favoriteTableInitPromise = ensureFavoriteTable();
    }
    await favoriteTableInitPromise;

    const telegramIdNum = parseInt(telegramId);
    const listingIdNum = parseInt(listingId);

    // Знаходимо користувача
    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
        telegramIdNum
      ) as Promise<Array<{ id: number }>>
    );

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;

    // Перевіряємо, чи favorite вже існує
    const existing = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM Favorite WHERE userId = ? AND listingId = ?`,
        userId,
        listingIdNum
      ) as Promise<Array<{ id: number }>>
    );

    if (existing.length > 0) {
      // Вже існує
      return NextResponse.json({ success: true, message: 'Already favorited' });
    }

    // Додаємо favorite
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO Favorite (userId, listingId, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        userId,
        listingIdNum
      )
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error adding favorite:', error);
    // Якщо помилка через UNIQUE constraint - це нормально (вже існує)
    if (error.message?.includes('UNIQUE constraint') || error.message?.includes('unique')) {
      return NextResponse.json({ success: true, message: 'Already favorited' });
    }
    return NextResponse.json(
      { error: 'Failed to add favorite' },
      { status: 500 }
    );
  }
}

// Видалити favorite
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');
    const listingId = searchParams.get('listingId');

    if (!telegramId || !listingId) {
      return NextResponse.json(
        { error: 'telegramId and listingId are required' },
        { status: 400 }
      );
    }

    // Перевіряємо та створюємо таблицю Favorite тільки один раз
    if (!favoriteTableInitPromise) {
      favoriteTableInitPromise = ensureFavoriteTable();
    }
    await favoriteTableInitPromise;

    const telegramIdNum = parseInt(telegramId);
    const listingIdNum = parseInt(listingId);

    // Знаходимо користувача
    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
        telegramIdNum
      ) as Promise<Array<{ id: number }>>
    );

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;

    // Видаляємо favorite
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM Favorite WHERE userId = ? AND listingId = ?`,
        userId,
        listingIdNum
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
