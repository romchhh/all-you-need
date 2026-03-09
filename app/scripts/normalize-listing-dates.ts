/**
 * Скрипт для нормалізації форматів дат у таблиці Listing.
 *
 * Проблема:
 * - Частина записів має дати у форматі "YYYY-MM-DD HH:MM:SS" (ОК для SQLite).
 * - Частина записів має значення типу "1773077465457" (мс від epoch) у полях
 *   createdAt / publishedAt / expiresAt — це ламає datetime() в SQLite і фронт.
 *
 * Рішення:
 * - Для всіх дат, які НЕ схожі на "YYYY-...", вважаємо, що це мс від epoch.
 * - Конвертуємо їх у нормальний datetime SQLite:
 *   datetime(value/1000, 'unixepoch') → "YYYY-MM-DD HH:MM:SS".
 *
 * Запуск з папки `app`:
 *   npx tsx scripts/normalize-listing-dates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Перевіряємо формати дат у таблиці Listing...\n');

  const [createdBad] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM Listing WHERE createdAt IS NOT NULL AND createdAt NOT LIKE '____-__-__%'`
  );
  const [publishedBad] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM Listing WHERE publishedAt IS NOT NULL AND publishedAt NOT LIKE '____-__-__%'`
  );
  const [expiresBad] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM Listing WHERE expiresAt IS NOT NULL AND expiresAt NOT LIKE '____-__-__%'`
  );

  console.log(
    `Проблемні формати до виправлення:\n` +
      `  createdAt:  ${createdBad?.count ?? 0}\n` +
      `  publishedAt: ${publishedBad?.count ?? 0}\n` +
      `  expiresAt:   ${expiresBad?.count ?? 0}\n`
  );

  // Нормалізуємо createdAt, якщо він збережений як мс (наприклад "1773077465457")
  if ((createdBad?.count ?? 0) > 0) {
    console.log('🛠 Нормалізуємо createdAt (ms → datetime)...');
    await prisma.$executeRawUnsafe(`
      UPDATE Listing
      SET createdAt = datetime(createdAt / 1000, 'unixepoch')
      WHERE createdAt IS NOT NULL
        AND createdAt NOT LIKE '____-__-__%'
    `);
  }

  // Нормалізуємо publishedAt
  if ((publishedBad?.count ?? 0) > 0) {
    console.log('🛠 Нормалізуємо publishedAt (ms → datetime)...');
    await prisma.$executeRawUnsafe(`
      UPDATE Listing
      SET publishedAt = datetime(publishedAt / 1000, 'unixepoch')
      WHERE publishedAt IS NOT NULL
        AND publishedAt NOT LIKE '____-__-__%'
    `);
  }

  // Нормалізуємо expiresAt
  if ((expiresBad?.count ?? 0) > 0) {
    console.log('🛠 Нормалізуємо expiresAt (ms → datetime)...');
    await prisma.$executeRawUnsafe(`
      UPDATE Listing
      SET expiresAt = datetime(expiresAt / 1000, 'unixepoch')
      WHERE expiresAt IS NOT NULL
        AND expiresAt NOT LIKE '____-__-__%'
    `);
  }

  const [createdBadAfter] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM Listing WHERE createdAt IS NOT NULL AND createdAt NOT LIKE '____-__-__%'`
  );
  const [publishedBadAfter] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM Listing WHERE publishedAt IS NOT NULL AND publishedAt NOT LIKE '____-__-__%'`
  );
  const [expiresBadAfter] = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM Listing WHERE expiresAt IS NOT NULL AND expiresAt NOT LIKE '____-__-__%'`
  );

  console.log(
    `\n✅ Після нормалізації:\n` +
      `  createdAt:  ${createdBadAfter?.count ?? 0} проблемних\n` +
      `  publishedAt: ${publishedBadAfter?.count ?? 0} проблемних\n` +
      `  expiresAt:   ${expiresBadAfter?.count ?? 0} проблемних\n`
  );
}

main()
  .catch((e) => {
    console.error('Помилка при нормалізації дат:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

