/**
 * Скрипт видалення фіксованого футера з описів оголошень (UK та RU текст).
 * Оновлює таблиці Listing та TelegramListing.
 * Запуск з папки app: npx tsx scripts/remove-description-footer.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEXTS_TO_REMOVE = [
  'Оголошення з відкритих перевірених джерел для україно- та російськомовних у Німеччині. Натисніть «Написати» — ми надішлемо контакт продавця. Розміщуйте свої оголошення безкоштовно!',
  'Мы нашли это объявление в открытых проверенных источниках для укр и рус язычных жителей Германии. Если вас интересует — нажмите «Написать», мы отправим вам контакт продавца. Размещайте свои объявления бесплатно!',
];

async function main() {
  console.log('Видалення футера з описів оголошень...\n');

  let totalListing = 0;
  let totalTelegram = 0;

  for (const text of TEXTS_TO_REMOVE) {
    const preview = text.length > 60 ? text.substring(0, 60) + '...' : text;
    console.log(`Текст (${text.length} сим.): "${preview}"`);

    const listingChanged = await prisma.$executeRawUnsafe(
      `UPDATE Listing SET description = REPLACE(description, ?, ''), updatedAt = datetime('now') WHERE INSTR(description, ?) > 0`,
      text,
      text
    );
    const telegramChanged = await prisma.$executeRawUnsafe(
      `UPDATE TelegramListing SET description = REPLACE(description, ?, ''), updatedAt = datetime('now') WHERE INSTR(description, ?) > 0`,
      text,
      text
    );

    totalListing += Number(listingChanged);
    totalTelegram += Number(telegramChanged);
    console.log(`  Listing: ${listingChanged}, TelegramListing: ${telegramChanged}\n`);
  }

  console.log(`Підсумок: оновлено Listing: ${totalListing}, TelegramListing: ${totalTelegram}`);
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
