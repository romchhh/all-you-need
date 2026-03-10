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

// Сервісні агрегатори (оголошення з чатів)
const AGGREGATOR_TELEGRAM_IDS = ['8590825131', '5587484547'];

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
    `\n✅ Після нормалізації форматів (ms → datetime):\n` +
      `  createdAt:  ${createdBadAfter?.count ?? 0} проблемних\n` +
      `  publishedAt: ${publishedBadAfter?.count ?? 0} проблемних\n` +
      `  expiresAt:   ${expiresBadAfter?.count ?? 0} проблемних\n`
  );

  console.log('\n🔧 Додатково вирівнюємо час публікації...\n');

  // 1. Знаходимо id сервісних агрегаторів
  const aggregatorUsers = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM "User" WHERE CAST("telegramId" AS TEXT) IN (${AGGREGATOR_TELEGRAM_IDS.map(() => '?').join(', ')})`,
    ...AGGREGATOR_TELEGRAM_IDS
  );
  const aggregatorUserIds = aggregatorUsers.map((u) => u.id);

  console.log(
    `Знайдено ${aggregatorUserIds.length} сервісних агрегаторів. Для них час буде 12:00, для всіх інших — 22:20.\n`
  );

  // 2. Для всіх НЕ сервісних користувачів ставимо час 22:20 (createdAt / publishedAt)
  if (aggregatorUserIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `
      UPDATE Listing
      SET 
        createdAt = CASE 
          WHEN createdAt IS NOT NULL 
          THEN datetime(strftime('%Y-%m-%d', createdAt) || ' 22:20:00')
          ELSE createdAt
        END,
        publishedAt = CASE 
          WHEN publishedAt IS NOT NULL 
          THEN datetime(strftime('%Y-%m-%d', publishedAt) || ' 22:20:00')
          ELSE publishedAt
        END
      WHERE userId NOT IN (${aggregatorUserIds.map(() => '?').join(', ')})
    `,
      ...aggregatorUserIds
    );
  } else {
    // Якщо агрегаторів не знайдено — застосовуємо 22:20 до всіх, крім NULL
    await prisma.$executeRawUnsafe(`
      UPDATE Listing
      SET 
        createdAt = CASE 
          WHEN createdAt IS NOT NULL 
          THEN datetime(strftime('%Y-%m-%d', createdAt) || ' 22:20:00')
          ELSE createdAt
        END,
        publishedAt = CASE 
          WHEN publishedAt IS NOT NULL 
          THEN datetime(strftime('%Y-%m-%d', publishedAt) || ' 22:20:00')
          ELSE publishedAt
        END
    `);
  }

  // 3. Для сервісних агрегаторів ставимо фіксовану дату публікації: 2026-03-08 12:00 (createdAt / publishedAt)
  if (aggregatorUserIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `
      UPDATE Listing
      SET 
        createdAt = CASE 
          WHEN createdAt IS NOT NULL 
          THEN '2026-03-08 12:00:00'
          ELSE createdAt
        END,
        publishedAt = CASE 
          WHEN publishedAt IS NOT NULL 
          THEN '2026-03-08 12:00:00'
          ELSE publishedAt
        END
      WHERE userId IN (${aggregatorUserIds.map(() => '?').join(', ')})
    `,
      ...aggregatorUserIds
    );
  }

  console.log('✅ Час публікації вирівняно: 22:20 для всіх, 2026-03-08 12:00 для сервісних агрегаторів.\n');

  console.log('🎲 Додаємо випадковий зсув часу (±0–2 години) для розсіювання оголошень...\n');

  // 4. Додаємо випадковий зсув часу до createdAt / publishedAt у діапазоні приблизно [-120; +120] хвилин
  // Використовуємо SQLite random(): abs(random()) % 241 дає 0..240, мінус 120 → -120..120 хв
  await prisma.$executeRawUnsafe(`
    UPDATE Listing
    SET 
      createdAt = CASE 
        WHEN createdAt IS NOT NULL 
        THEN datetime(createdAt, printf('%+d minutes', (abs(random()) % 241) - 120))
        ELSE createdAt
      END,
      publishedAt = CASE 
        WHEN publishedAt IS NOT NULL 
        THEN datetime(publishedAt, printf('%+d minutes', (abs(random()) % 241) - 120))
        ELSE publishedAt
      END
  `);

  console.log('✅ Час публікації/створення розподілено випадковим чином в межах ±2 годин для всіх оголошень.\n');
}

main()
  .catch((e) => {
    console.error('Помилка при нормалізації дат:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

