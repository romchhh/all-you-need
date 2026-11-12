import { prisma, executeWithRetry } from '@/lib/prisma';
import { isPostgres, tableExistsQuery, sqlNow } from '@/lib/dbSql';
import { foldCityKey } from '@/lib/city/cityNormalization';

let shareChatTablesReady = false;

/** PG: INTEGER 0/1 (runtime CREATE) або BOOLEAN (Prisma). */
export async function shareFlagPgCast(table: string, column: string): Promise<'int' | 'bool'> {
  if (!isPostgres()) return 'int';
  try {
    const rows = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public'
           AND lower(table_name) = lower(?)
           AND lower(column_name) = lower(?)
         LIMIT 1`,
        table,
        column
      )
    )) as Array<{ data_type: string }>;
    const t = String(rows[0]?.data_type || '').toLowerCase();
    if (t === 'boolean') return 'bool';
  } catch {
    // ignore
  }
  return 'int';
}

let cachedIsSavedKind: 'int' | 'bool' | null = null;

/** Значення для UserShareChat.isSaved під реальний тип колонки в БД. */
export async function userShareChatSavedValue(on: boolean): Promise<boolean | number> {
  if (cachedIsSavedKind == null) {
    cachedIsSavedKind = await shareFlagPgCast('UserShareChat', 'isSaved');
  }
  if (cachedIsSavedKind === 'bool') return on;
  return on ? 1 : 0;
}

const SEED_CHATS: Array<{
  title: string;
  subtitle: string;
  cityKey: string | null;
  categorySlug: string | null;
  language: string;
  memberCount: number;
  inviteLink: string | null;
  sortOrder: number;
}> = [
  {
    title: 'Барахолка Гамбург',
    subtitle: 'Оголошення та покупки',
    cityKey: foldCityKey('Hamburg'),
    categorySlug: null,
    language: 'ru',
    memberCount: 42800,
    inviteLink: null,
    sortOrder: 10,
  },
  {
    title: 'Меблі в Гамбурзі',
    subtitle: 'Меблі, інтер’єр',
    cityKey: foldCityKey('Hamburg'),
    categorySlug: 'furniture',
    language: 'uk',
    memberCount: 18300,
    inviteLink: null,
    sortOrder: 20,
  },
  {
    title: 'Объявления Германия',
    subtitle: 'Загальна барахолка',
    cityKey: null,
    categorySlug: null,
    language: 'ru',
    memberCount: 96400,
    inviteLink: null,
    sortOrder: 5,
  },
  {
    title: 'Berlin Flohmarkt',
    subtitle: 'Berlin — Kleinanzeigen',
    cityKey: foldCityKey('Berlin'),
    categorySlug: null,
    language: 'ru',
    memberCount: 51200,
    inviteLink: null,
    sortOrder: 15,
  },
  {
    title: 'Куплю-Продам Hamburg',
    subtitle: 'Объявления и покупки — 27 100 участников',
    cityKey: foldCityKey('Hamburg'),
    categorySlug: null,
    language: 'ru',
    memberCount: 27100,
    inviteLink: null,
    sortOrder: 25,
  },
];

async function seedCatalogIfEmpty(): Promise<void> {
  const rows = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(`SELECT id FROM ShareChatCatalog LIMIT 1`)
  )) as Array<{ id: number }>;
  if (rows.length > 0) return;

  const flagKind = await shareFlagPgCast('ShareChatCatalog', 'postingAllowed');
  const flagSql = isPostgres()
    ? flagKind === 'bool'
      ? '?::boolean'
      : '?::int'
    : '?';
  const flagVal = flagKind === 'bool' ? true : 1;

  for (const row of SEED_CHATS) {
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO ShareChatCatalog (
          title, subtitle, cityKey, categorySlug, language, memberCount,
          postingAllowed, inviteLink, sortOrder, isActive, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ${flagSql}, ?, ?, ${flagSql}, ${sqlNow()})`,
        row.title,
        row.subtitle,
        row.cityKey,
        row.categorySlug,
        row.language,
        row.memberCount,
        flagVal,
        row.inviteLink,
        row.sortOrder,
        flagVal
      )
    );
  }
}

export async function ensureShareChatTables(): Promise<void> {
  if (shareChatTablesReady) return;

  const exists = await executeWithRetry(() =>
    prisma.$queryRawUnsafe<Array<{ name: string }>>(tableExistsQuery('ShareChatCatalog'))
  );

  if (exists.length === 0) {
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ShareChatCatalog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          subtitle TEXT,
          avatarUrl TEXT,
          cityKey TEXT,
          categorySlug TEXT,
          language TEXT NOT NULL DEFAULT 'ru',
          memberCount INTEGER NOT NULL DEFAULT 0,
          postingAllowed INTEGER NOT NULL DEFAULT 1,
          inviteLink TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
    );

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS UserShareChat (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          catalogChatId INTEGER,
          title TEXT NOT NULL,
          subtitle TEXT,
          inviteLink TEXT,
          language TEXT NOT NULL DEFAULT 'ru',
          memberCount INTEGER NOT NULL DEFAULT 0,
          isSaved INTEGER NOT NULL DEFAULT 1,
          source TEXT NOT NULL DEFAULT 'custom',
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
          FOREIGN KEY (catalogChatId) REFERENCES ShareChatCatalog(id) ON DELETE CASCADE
        )
      `)
    );

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_sharechatcatalog_city ON ShareChatCatalog(cityKey)`
      )
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_usersharechat_user ON UserShareChat(userId)`
      )
    );

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ShareDistributionLog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          listingId INTEGER NOT NULL,
          userId INTEGER NOT NULL,
          chatText TEXT NOT NULL,
          catalogChatIds TEXT,
          customChatIds TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
    );
  }

  await seedCatalogIfEmpty();
  shareChatTablesReady = true;
}
