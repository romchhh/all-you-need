import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserLanguageForTelegramId } from '@/lib/userBootstrapQueries';

async function upsertLegacyLanguage(telegramId: string, language: 'uk' | 'ru') {
  const now = new Date().toISOString();
  const legacyRows = (await prisma.$queryRawUnsafe(
    `SELECT id FROM users_legacy WHERE user_id = ?`,
    telegramId
  )) as Array<{ id: number }>;

  if (legacyRows.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE users_legacy SET language = ? WHERE user_id = ?`,
      language,
      telegramId
    );
    return;
  }

  const nextIdRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX(id), 0) + 1 as id FROM users_legacy`
  )) as Array<{ id: number | bigint }>;
  const nextId = Number(nextIdRows[0]?.id ?? 1);

  await prisma.$executeRawUnsafe(
    `INSERT INTO users_legacy (id, user_id, language, join_date, last_activity) VALUES (?, ?, ?, ?, ?)`,
    nextId,
    telegramId,
    language,
    now,
    now
  );
}

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

    const telegramIdNum = parseInt(telegramId, 10);

    const existingUsers = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
    `;

    if (existingUsers.length === 0) {
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO User (telegramId, username, firstName, lastName, balance, rating, reviewsCount, isActive, agreementAccepted, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, 5, 0, true, false, ?, ?)`,
        telegramIdNum,
        null,
        null,
        null,
        now,
        now
      );
    }

    await upsertLegacyLanguage(String(telegramId), language);

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
