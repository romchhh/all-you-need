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
  // Використовуємо поточний час мінус 8 годин
  const now = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 днів

  console.log(
    '🔁 Оновлюємо publishedAt та expiresAt для всіх оголошень, окрім двох агрегаторів...\n'
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

  // 2. Оновлюємо всі оголошення, де userId НЕ входить у список агрегаторів
  const updated = await prisma.listing.updateMany({
    where: {
      userId: {
        notIn: aggregatorUserIds.length ? aggregatorUserIds : [-1], // якщо не знайдено жодного, оновити всі
      },
    },
    data: {
      publishedAt: now,
      expiresAt,
    },
  });

  console.log(
    `✅ Оновлено publishedAt та expiresAt для ${updated.count} оголошень (усі користувачі, крім агрегаторів).\n`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

