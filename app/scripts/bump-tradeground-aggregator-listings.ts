/**
 * Скрипт оновлює дату публікації (publishedAt)
 * та дату завершення (expiresAt) для ВСІХ оголошень,
 * окрім оголошень двох агрегаторів TradeGround.
 *
 * Користувачі-агрегатори (оголошення з чатів), яких потрібно пропустити:
 * - @tradeground_seller  (telegramId: 8590825131)
 * - @tradeground_seller2 (telegramId: 5587484547)
 *
 * Запуск з папки `app`:
 *   npx tsx scripts/bump-tradeground-aggregator-listings.ts
 */

import { PrismaClient } from '@prisma/client';
import { executeInClause } from '@/utils/dbHelpers';

const AGGREGATOR_TELEGRAM_IDS = ['8590825131', '5587484547'];

async function main() {
  // Використовуємо поточний час (без зсуву назад)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 днів

  // Форматуємо дати у формат, сумісний з усіма SQL-скриптами (SQLite datetime)
  const toSQLiteDate = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 19);
  const nowStr = toSQLiteDate(now);
  const expiresAtStr = toSQLiteDate(expiresAt);

  console.log(
    '🔁 Оновлюємо дати для всіх оголошень (користувачі — сьогодні, агрегатори — завтра)...\n'
  );

  // 1. Знаходимо id користувачів-агрегаторів, яких треба пропустити
  const aggregatorUsers = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM "User" WHERE CAST("telegramId" AS TEXT) IN (${AGGREGATOR_TELEGRAM_IDS.map(() => '?').join(', ')})`,
    ...AGGREGATOR_TELEGRAM_IDS
  );

  const aggregatorUserIds = aggregatorUsers.map((u) => u.id);

  console.log(
    `Знайдено ${aggregatorUserIds.length} користувач(ів)-агрегаторів, їх оголошення будуть пропущені.`
  );

  // 2. Знаходимо всі оголошення, де userId НЕ входить у список агрегаторів
  const listingsToUpdate = await prisma.listing.findMany({
    where: {
      userId: {
        notIn: aggregatorUserIds.length ? aggregatorUserIds : [-1], // якщо не знайдено жодного, оновити всі
      },
    },
    select: {
      id: true,
      userId: true,
      title: true,
    },
  });

  console.log(`Буде оновлено ${listingsToUpdate.length} оголошень. Перелік id:`);
  for (const l of listingsToUpdate) {
    console.log(` - listingId=${l.id}, userId=${l.userId}, title="${l.title}"`);
  }

  // 3. Оновлюємо всі знайдені оголошення звичайних користувачів (сьогодні)
  const listingIdsToUpdate = listingsToUpdate.map((l) => l.id);

  if (listingIdsToUpdate.length > 0) {
    await executeInClause(
      `UPDATE Listing
       SET createdAt = ?, 
           publishedAt = ?, 
           expiresAt = ?
       WHERE id IN (?)`,
      [nowStr, nowStr, expiresAtStr, ...listingIdsToUpdate]
    );

    console.log(
      `✅ Оновлено createdAt/publishedAt/expiresAt (сьогодні) для ${listingIdsToUpdate.length} оголошень (усі користувачі, крім агрегаторів).\n`
    );
  } else {
    console.log('ℹ️ Немає оголошень звичайних користувачів для оновлення.\n');
  }

  // 4. Окремо обробляємо оголошення агрегаторів — робимо їм -12 годин від поточної createdAt/publishedAt
  if (aggregatorUserIds.length) {
    const aggregatorListings = await prisma.listing.findMany({
      where: {
        userId: { in: aggregatorUserIds },
      },
      select: {
        id: true,
        userId: true,
        title: true,
      },
    });

    console.log(
      `Для агрегаторів буде оновлено ${aggregatorListings.length} оголошень (дата — завтра). Перелік id:`
    );
    for (const l of aggregatorListings) {
      console.log(` - [AGG] listingId=${l.id}, userId=${l.userId}, title="${l.title}"`);
    }

    const aggregatorListingIds = aggregatorListings.map((l) => l.id);

    if (aggregatorListingIds.length > 0) {
      // Зменшуємо createdAt та publishedAt на 12 годин від поточного значення в БД
      await executeInClause(
        `UPDATE Listing
         SET createdAt = datetime(createdAt, '-12 hours'),
             publishedAt = datetime(publishedAt, '-12 hours')
         WHERE id IN (?)`,
        aggregatorListingIds
      );

      console.log(
        `✅ Для агрегаторів зменшено createdAt/publishedAt на 12 годин для ${aggregatorListingIds.length} оголошень.\n`
      );
    } else {
      console.log('ℹ️ У агрегаторів немає оголошень для оновлення.\n');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

