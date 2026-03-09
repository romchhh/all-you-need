/**
 * Скрипт для оновлення дати додавання (createdAt)
 * для останніх 100 оголошень кожного з агрегаторів TradeGround.
 *
 * Користувачі-агрегатори (оголошення з чатів):
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
  const now = new Date();

  console.log('🔁 Оновлюємо createdAt для останніх 100 оголошень агрегаторів...\n');

  for (const telegramId of AGGREGATOR_TELEGRAM_IDS) {
    console.log(`Обробка користувача з telegramId = ${telegramId}...`);

    // Використовуємо сирий SQL, щоб уникнути проблем з конверсією BigInt/INT
    const users = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM User WHERE CAST(telegramId AS TEXT) = ? LIMIT 1`,
      telegramId
    );

    const user = users[0];

    if (!user) {
      console.warn(`  ⚠️ Користувача з telegramId=${telegramId} не знайдено. Пропускаємо.\n`);
      continue;
    }

    const listings = await prisma.listing.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true },
    });

    if (listings.length === 0) {
      console.log('  Немає оголошень для оновлення.\n');
      continue;
    }

    const ids = listings.map(l => l.id);

    const updated = await prisma.listing.updateMany({
      where: { id: { in: ids } },
      data: { createdAt: now },
    });

    console.log(
      `  Користувач id=${user.id}: оновлено createdAt для ${updated.count} оголошень (запитано: ${ids.length}).\n`
    );
  }

  console.log('✅ Готово.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

