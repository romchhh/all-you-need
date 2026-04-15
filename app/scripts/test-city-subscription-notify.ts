/**
 * Повторна відправка сповіщень підписникам міста для існуючого оголошення маркетплейсу
 * (той самий шлях, що після схвалення в approveListing).
 *
 * Запуск з каталогу `app`, зі змінними з `.env`:
 *
 *   LISTING_ID=42 npx tsx scripts/test-city-subscription-notify.ts
 *
 * Потрібно: DATABASE_URL, TELEGRAM_BOT_TOKEN, WEBAPP_URL (кнопка міні-апу).
 * У БД мають бути рядки в CitySubscription з cityKey, що збігається з першою частиною location оголошення.
 */

import { prisma } from '../lib/prisma';
import { notifyCitySubscribersOfNewMarketplaceListing } from '../utils/citySubscriptionNotifications';

async function main() {
  const raw = process.env.LISTING_ID ?? process.argv[2];
  const listingId = raw ? parseInt(String(raw).replace(/^--listing=/, ''), 10) : NaN;
  if (Number.isNaN(listingId)) {
    console.error('Usage: LISTING_ID=<id> npx tsx scripts/test-city-subscription-notify.ts');
    console.error('   or: npx tsx scripts/test-city-subscription-notify.ts <id>');
    process.exit(1);
  }

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT l.id, l.userId, l.title, l.location, l.status FROM Listing l WHERE l.id = ?`,
    listingId
  )) as Array<{
    id: number;
    userId: number;
    title: string;
    location: string | null;
    status: string;
  }>;

  if (!rows[0]) {
    console.error('Listing not found:', listingId);
    process.exit(1);
  }

  const l = rows[0];
  console.log('Listing:', {
    id: l.id,
    status: l.status,
    location: l.location,
    title: l.title?.slice(0, 80),
  });

  await notifyCitySubscribersOfNewMarketplaceListing({
    listingId: l.id,
    userId: l.userId,
    title: l.title,
    location: l.location || '',
  });

  console.log('Finished (check logs above for [CitySubscription] and Telegram errors).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
