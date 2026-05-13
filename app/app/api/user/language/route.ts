import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserLanguageForTelegramId } from '@/lib/userBootstrapQueries';

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

    const language = await getUserLanguageForTelegramId(telegramId);
    return NextResponse.json({ language });
  } catch (error) {
    console.error('Error getting user language:', error);
    return NextResponse.json(
      { error: 'Failed to get language', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

