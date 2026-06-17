/**
 * Скрипт для очищення дублів "(Oder)" у містах виду
 * "Frankfurt am Main (Oder) (Oder) (Oder) ..."
 *
 * Оновлює поля `location` у таблицях `Listing` та `TelegramListing`,
 * залишаючи просто "Frankfurt".
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
    `Запуск скрипта очищення Frankfurt від зайвих "(Oder)" (${DRY_RUN ? 'DRY RUN — без змін в БД' : 'ON-LINE ОНОВЛЕННЯ'})...\n`
  );

  const patterns = ['Frankfurt am Main (Oder)%', 'Frankfurt (Oder)%'];

  if (DRY_RUN) {
    for (const pattern of patterns) {
      const listingCount = await prisma.listing.count({
        where: { location: { startsWith: pattern.replace('%', '') } },
      });
      const telegramCount = await prisma.telegramListing.count({
        where: { location: { startsWith: pattern.replace('%', '') } },
      });
      console.log(
        `Pattern "${pattern}": Listing≈${listingCount}, TelegramListing≈${telegramCount}`
      );
    }
    console.log('\nГотово (DRY RUN).');
    return;
  }

  let listingChanged = 0;
  let telegramChanged = 0;
  for (const pattern of patterns) {
    listingChanged += Number(
      await prisma.$executeRawUnsafe(
        `UPDATE Listing
         SET location = TRIM(REPLACE(REPLACE(location, 'Frankfurt am Main', 'Frankfurt'), ' (Oder)', ''))
         WHERE location LIKE ?`,
        pattern
      )
    );
    telegramChanged += Number(
      await prisma.$executeRawUnsafe(
        `UPDATE TelegramListing
         SET location = TRIM(REPLACE(REPLACE(location, 'Frankfurt am Main', 'Frankfurt'), ' (Oder)', ''))
         WHERE location LIKE ?`,
        pattern
      )
    );
  }

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

