/**
 * Скрипт заміни локації "Гамбург" на "Hamburg" в БД.
 * Оновлює таблиці Listing та TelegramListing.
 * Запуск з папки app: npx tsx scripts/fix-location-hamburg.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FROM = 'Гамбург';
const TO = 'Hamburg';

async function main() {
  console.log(`Заміна локації "${FROM}" → "${TO}" в БД...\n`);

  // Listing: REPLACE у всіх записах, де location містить "Гамбург"
  const listingChanged = await prisma.$executeRawUnsafe(
    `UPDATE Listing SET location = REPLACE(location, ?, ?) WHERE location LIKE ?`,
    FROM,
    TO,
    `%${FROM}%`
  );
  console.log(`Listing: оновлено записів: ${listingChanged}`);

  // TelegramListing
  const telegramChanged = await prisma.$executeRawUnsafe(
    `UPDATE TelegramListing SET location = REPLACE(location, ?, ?) WHERE location LIKE ?`,
    FROM,
    TO,
    `%${FROM}%`
  );
  console.log(`TelegramListing: оновлено записів: ${telegramChanged}`);

  const listingsWithHamburg = await prisma.listing.count({
    where: { location: { contains: TO } },
  });
  const telegramWithHamburg = await prisma.telegramListing.count({
    where: { location: { contains: TO } },
  });
  console.log(`\nПідсумок: записів з "${TO}" — Listing: ${listingsWithHamburg}, TelegramListing: ${telegramWithHamburg}`);
  console.log('Готово.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
