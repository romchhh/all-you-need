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

const prisma = new PrismaClient();

const AGGREGATOR_TELEGRAM_IDS = ['8590825131', '5587484547'];

async function main() {
  // Використовуємо поточний час (без зсуву назад)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 днів
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const expiresAtTomorrow = new Date(tomorrow.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 днів

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
  const updated = await prisma.listing.updateMany({
    where: {
      id: {
        in: listingsToUpdate.map((l) => l.id),
      },
    },
    data: {
      createdAt: now,
      publishedAt: now,
      expiresAt,
    },
  });

  console.log(
    `✅ Оновлено createdAt/publishedAt/expiresAt (сьогодні) для ${updated.count} оголошень (усі користувачі, крім агрегаторів).\n`
  );

  // 4. Окремо обробляємо оголошення агрегаторів — ставимо їм дату "завтра"
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

    const updatedAggregators = await prisma.listing.updateMany({
      where: {
        id: { in: aggregatorListings.map((l) => l.id) },
      },
      data: {
        createdAt: tomorrow,
        publishedAt: tomorrow,
        expiresAt: expiresAtTomorrow,
      },
    });

    console.log(
      `✅ Оновлено createdAt/publishedAt/expiresAt (завтра) для ${updatedAggregators.count} оголошень агрегаторів.\n`
    );
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

