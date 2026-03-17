/**
 * Реактивація неактивних та прострочених оголошень.
 *
 * - Всі оголошення зі статусами:
 *   - 'expired'
 *   - 'deactivated'
 *   - 'hidden'
 *   стають `active`.
 *
 * - Дати виставляються так:
 *   - createdAt  = сьогодні - 5 днів
 *   - publishedAt = сьогодні - 5 днів
 *   - expiresAt  = сьогодні + 25 днів
 *
 * Запуск з папки `app`:
 *   npx tsx scripts/reactivate-expired-listings.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toSQLiteDate(d: Date): string {
  // YYYY-MM-DD HH:MM:SS
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

async function main() {
  const now = new Date();

  // дата подачі — 5 днів тому
  const minus5 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  // дата просрочення — через 25 днів від сьогодні
  const plus25 = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);

  const createdAtStr = toSQLiteDate(minus5);
  const publishedAtStr = toSQLiteDate(minus5);
  const expiresAtStr = toSQLiteDate(plus25);

  console.log('⏱ Поточний час:           ', toSQLiteDate(now));
  console.log('📝 Нова дата подачі:      ', createdAtStr);
  console.log('📢 Нова дата публікації:  ', publishedAtStr);
  console.log('⌛️ Нова дата просрочення: ', expiresAtStr);
  console.log('\nШукаємо неактивні / прострочені оголошення...\n');

  // Знаходимо всі оголошення зі статусом expired / deactivated / hidden
  const listings = await prisma.$queryRawUnsafe<
    Array<{ id: number; status: string; title: string | null }>
  >(
    `
      SELECT id, status, title
      FROM Listing
      WHERE status IN ('expired', 'deactivated', 'hidden')
    `
  );

  if (!listings.length) {
    console.log('ℹ️ Немає оголошень зі статусами expired/deactivated/hidden — нічого оновлювати.');
    return;
  }

  console.log(`Знайдено ${listings.length} оголошень для реактивації:`);
  for (const l of listings) {
    console.log(` - [${l.status}] id=${l.id}, title="${l.title ?? ''}"`);
  }

  const ids = listings.map((l) => l.id);
  const placeholders = ids.map(() => '?').join(',');

  console.log('\nОновлюємо статус та дати для цих оголошень...\n');

  const updated = await prisma.$executeRawUnsafe(
    `
      UPDATE Listing
      SET status      = 'active',
          moderationStatus = 'approved',
          createdAt   = ?,
          publishedAt = ?,
          expiresAt   = ?
      WHERE id IN (${placeholders})
    `,
    createdAtStr,
    publishedAtStr,
    expiresAtStr,
    ...ids
  );

  console.log(`✅ Оновлено записів: ${Number(updated)}`);
  console.log('\nГотово.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

