/**
 * Скрипт для видалення конкретних користувачів та всіх їхніх оголошень.
 *
 * Запуск:
 *   cd app
 *   npx tsx scripts/delete-specific-users.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Telegram username користувачів БЕЗ символу '@'
const USERNAMES_TO_DELETE = [
  'julia_wwwweeebber', // Julia Weber
  'max_ssssswe',       // Max Schmidt
  'anna_mwenenwnenw',  // Anna Müller
];

async function main() {
  console.log('Starting deletion of specific users...');
  console.log('Usernames to delete:', USERNAMES_TO_DELETE.join(', '));

  const users = await prisma.user.findMany({
    where: {
      username: {
        in: USERNAMES_TO_DELETE,
      },
    },
    select: {
      id: true,
      telegramId: true,
      username: true,
    },
  });

  if (users.length === 0) {
    console.log('Користувачів з такими username не знайдено.');
    return;
  }

  const userIds = users.map((u) => u.id);

  console.log(`Знайдено ${users.length} користувач(ів):`);
  for (const user of users) {
    console.log(
      `- id=${user.id}, telegramId=${user.telegramId.toString()}, username=${user.username}`,
    );
  }

  // Для інформації порахуємо кількість оголошень перед видаленням
  const [listingCount, telegramListingCount] = await Promise.all([
    prisma.listing.count({ where: { userId: { in: userIds } } }),
    prisma.telegramListing.count({ where: { userId: { in: userIds } } }),
  ]);

  console.log(
    `Перед видаленням: ${listingCount} оголошень у таблиці Listing та ${telegramListingCount} оголошень у таблиці TelegramListing.`,
  );

  // Завдяки onDelete: Cascade у Prisma, видалення користувачів також видалить пов'язані оголошення
  const deleteResult = await prisma.user.deleteMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });

  console.log(`Видалено користувачів: ${deleteResult.count}`);
  console.log('Готово.');
}

main()
  .catch((e) => {
    console.error('Помилка при виконанні скрипта:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

