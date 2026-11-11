import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserLanguageForTelegramId } from '@/lib/userBootstrapQueries';
import {
  normalizeTelegramIdForDb,
  sqlUserTelegramIdWhere,
  usersLegacyTelegramIdWhere,
} from '@/lib/dbSql';

async function upsertLegacyLanguage(telegramIdKey: string, language: 'uk' | 'ru') {
  const now = new Date().toISOString();
  const legacyWhere = usersLegacyTelegramIdWhere('?');
  const legacyRows = (await prisma.$queryRawUnsafe(
    `SELECT id FROM users_legacy WHERE ${legacyWhere}`,
    telegramIdKey
  )) as Array<{ id: number }>;

  if (legacyRows.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE users_legacy SET language = ? WHERE ${legacyWhere}`,
      language,
      telegramIdKey
    );
    return;
  }

  const nextIdRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX(id), 0) + 1 as id FROM users_legacy`
  )) as Array<{ id: number | bigint }>;
  const nextId = Number(nextIdRows[0]?.id ?? 1);

  // user_id NUMERIC: передаємо рядок цифр; адаптер/rewrite зробить ::numeric
  await prisma.$executeRawUnsafe(
    `INSERT INTO users_legacy (id, user_id, language, join_date, last_activity) VALUES (?, ?, ?, ?, ?)`,
    nextId,
    telegramIdKey,
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

    const telegramIdKey = normalizeTelegramIdForDb(telegramId);
    if (!telegramIdKey) {
      return NextResponse.json({ error: 'Invalid telegramId' }, { status: 400 });
    }

    // TEXT = TEXT (не number/bigint — інакше PG: operator does not exist: text = bigint)
    const existingUsers = (await prisma.$queryRawUnsafe(
      `SELECT id FROM "User" WHERE ${sqlUserTelegramIdWhere('?')}`,
      telegramIdKey
    )) as Array<{ id: number }>;

    if (existingUsers.length === 0) {
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("telegramId", username, "firstName", "lastName", balance, rating, "reviewsCount", "isActive", "agreementAccepted", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, 0, 5, 0, true, false, ?, ?)`,
        telegramIdKey,
        null,
        null,
        null,
        now,
        now
      );
    }

    await upsertLegacyLanguage(telegramIdKey, language);

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
