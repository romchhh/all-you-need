/**
 * Скрипт для очищення дублів "(Oder)" у містах виду
 * "Frankfurt am Main (Oder) (Oder) (Oder) ..."
 *
 * Оновлює поля `location` у таблицях `Listing` та `TelegramListing`,
 * залишаючи просто "Frankfurt am Main".
 *
 * Запуск з папки `app`:
 *   npx tsx scripts/fix-frankfurt-oder-duplicates.ts          # реальне оновлення
 *   npx tsx scripts/fix-frankfurt-oder-duplicates.ts --dry-run # тільки показати, що буде змінено
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(
    `Запуск скрипта очищення Frankfurt am Main від зайвих "(Oder)" (${DRY_RUN ? 'DRY RUN — без змін в БД' : 'ON-LINE ОНОВЛЕННЯ'})...\n`
  );

  const pattern = 'Frankfurt am Main (Oder)%';

  if (DRY_RUN) {
    const listingCount = await prisma.listing.count({
      where: { location: { startsWith: 'Frankfurt am Main (Oder)' } },
    });
    const telegramCount = await prisma.telegramListing.count({
      where: { location: { startsWith: 'Frankfurt am Main (Oder)' } },
    });

    console.log(
      `Listing: буде очищено записів ≈ ${listingCount} (location LIKE "${pattern}")`
    );
    console.log(
      `TelegramListing: буде очищено записів ≈ ${telegramCount} (location LIKE "${pattern}")`
    );
    console.log('\nГотово (DRY RUN).');
    return;
  }

  // Очищаємо Listing: прибираємо всі " (Oder)" і тримаємо пробіли
  const listingChanged = await prisma.$executeRawUnsafe(
    `UPDATE Listing
     SET location = TRIM(REPLACE(location, ' (Oder)', ''))
     WHERE location LIKE ?`,
    pattern
  );

  const telegramChanged = await prisma.$executeRawUnsafe(
    `UPDATE TelegramListing
     SET location = TRIM(REPLACE(location, ' (Oder)', ''))
     WHERE location LIKE ?`,
    pattern
  );

  console.log(
    `Оновлено записів: Listing=${listingChanged}, TelegramListing=${telegramChanged}`
  );
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

