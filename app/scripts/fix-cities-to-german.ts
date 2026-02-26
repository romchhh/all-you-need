/**
 * Скрипт масової заміни назв міст на оригінальні німецькі варіанти.
 *
 * Працює по полю `location` у таблицях `Listing` та `TelegramListing`.
 *
 * Запуск з папки `app`:
 *   npx tsx scripts/fix-cities-to-german.ts          # реальне оновлення
 *   npx tsx scripts/fix-cities-to-german.ts --dry-run # тільки показати, що буде змінено
 */

import { PrismaClient } from '@prisma/client';
import { isGermanCityValid } from '../constants/german-cities';

const prisma = new PrismaClient();

// Маппінг англомовних/спрощених назв → оригінальні німецькі
// Додайте сюди всі потрібні міста.
const CITY_REPLACEMENTS: { from: string; to: string }[] = [
  { from: 'Munich', to: 'München' },
  { from: 'Cologne', to: 'Köln' },
  { from: 'Koln', to: 'Köln' },
  { from: 'Nuremberg', to: 'Nürnberg' },
  { from: 'Dusseldorf', to: 'Düsseldorf' },
  { from: 'Frankfurt', to: 'Frankfurt (Oder)' },
  // приклад з уже існуючим скриптом:
  { from: 'Гамбург', to: 'Hamburg' },
  // ДОДАЙТЕ СЮДИ ІНШІ МІСТА ЗА ПОТРЕБОЮ
];

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Перевіряємо, що всі цільові міста існують в довіднику germanCities
  const invalidTargets = CITY_REPLACEMENTS.filter(({ to }) => !isGermanCityValid(to));
  if (invalidTargets.length > 0) {
    console.warn('⚠️ Деякі цільові міста відсутні в базовому списку germanCities:');
    invalidTargets.forEach(({ to }) => {
      console.warn(`  - "${to}"`);
    });
    console.warn('Перевірте написання цих міст перед запуском міграції.\n');
  }

  console.log(
    `Запуск скрипта заміни міст (${DRY_RUN ? 'DRY RUN — без змін в БД' : 'ON-LINE ОНОВЛЕННЯ'})...\n`
  );

  let totalListingChanged = 0;
  let totalTelegramChanged = 0;

  for (const { from, to } of CITY_REPLACEMENTS) {
    console.log(`Обробка міста "${from}" → "${to}"...`);

    if (DRY_RUN) {
      const listingCount = await prisma.listing.count({
        where: { location: { contains: from } },
      });
      const telegramCount = await prisma.telegramListing.count({
        where: { location: { contains: from } },
      });

      console.log(
        `  Listing: буде оновлено записів ≈ ${listingCount} (location CONTAINS "${from}")`
      );
      console.log(
        `  TelegramListing: буде оновлено записів ≈ ${telegramCount} (location CONTAINS "${from}")`
      );
      console.log('');
      continue;
    }

    // Listing: REPLACE у всіх записах, де location містить from
    const listingChanged = await prisma.$executeRawUnsafe(
      `UPDATE Listing SET location = REPLACE(location, ?, ?) WHERE location LIKE ?`,
      from,
      to,
      `%${from}%`
    );
    totalListingChanged += Number(listingChanged);

    // TelegramListing
    const telegramChanged = await prisma.$executeRawUnsafe(
      `UPDATE TelegramListing SET location = REPLACE(location, ?, ?) WHERE location LIKE ?`,
      from,
      to,
      `%${from}%`
    );
    totalTelegramChanged += Number(telegramChanged);

    console.log(
      `  Оновлено записів: Listing=${listingChanged}, TelegramListing=${telegramChanged}\n`
    );
  }

  console.log('--- ПІДСУМКИ ---');
  console.log(`Загалом оновлено в Listing: ${totalListingChanged}`);
  console.log(`Загалом оновлено в TelegramListing: ${totalTelegramChanged}`);

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

