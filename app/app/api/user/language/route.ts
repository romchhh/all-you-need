import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId, language } = body;

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    if (!language || !['uk', 'ru'].includes(language)) {
      return NextResponse.json(
        { error: 'Invalid language. Must be "uk" or "ru"' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);

    // Перевіряємо чи користувач існує
    const existingUsers = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
    `;

    if (existingUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Оновлюємо мову в таблиці User (якщо поле існує)
    // Спочатку перевіряємо чи поле language існує
    try {
      await prisma.$executeRaw`
        UPDATE User 
        SET language = ${language}
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
    } catch (error: any) {
      // Якщо поле language не існує, додаємо його
      if (error.message?.includes('no such column: language')) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE User ADD COLUMN language TEXT DEFAULT 'uk'
        `);
        await prisma.$executeRaw`
          UPDATE User 
          SET language = ${language}
          WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
        `;
      } else {
        throw error;
      }
    }

    // Також оновлюємо в legacy таблиці для сумісності
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE users_legacy 
        SET language = ?
        WHERE user_id = ?
      `, language, telegramId.toString());
    } catch (error) {
      // Якщо таблиці немає, це не критично
    }

    return NextResponse.json({ success: true, language });
  } catch (error) {
    console.error('Error updating user language:', error);
    return NextResponse.json(
      { error: 'Failed to update language', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);

    // Спочатку перевіряємо legacy таблицю (основне джерело)
    try {
      const legacyUsers = await prisma.$queryRawUnsafe(`
        SELECT language FROM users_legacy 
        WHERE user_id = ?
      `, telegramId) as Array<{ language: string | null }>;

      if (legacyUsers.length > 0 && legacyUsers[0].language) {
        return NextResponse.json({ language: legacyUsers[0].language });
      }
    } catch (legacyError) {
      // Якщо legacy таблиці немає, це не критично - продовжуємо
    }

    // Потім перевіряємо таблицю User (якщо колонка language існує)
    try {
      const users = await prisma.$queryRawUnsafe(`
        SELECT language FROM User 
        WHERE CAST(telegramId AS INTEGER) = ?
      `, telegramIdNum) as Array<{ language: string | null }>;

      if (users.length > 0 && users[0].language) {
        return NextResponse.json({ language: users[0].language });
      }
    } catch (error: any) {
      // Якщо поле language не існує в таблиці User, це нормально - просто ігноруємо
    }

    // За замовчуванням повертаємо 'uk'
    return NextResponse.json({ language: 'uk' });
  } catch (error) {
    console.error('Error getting user language:', error);
    return NextResponse.json(
      { error: 'Failed to get language', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

