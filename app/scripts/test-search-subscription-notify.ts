/**
 * Повторна відправка сповіщень підписникам пошуку для існуючого оголошення.
 *
 *   LISTING_ID=42 npx tsx scripts/test-search-subscription-notify.ts
 */

import { prisma } from '../lib/prisma';
import { notifySearchSubscribersForListingId } from '../lib/search/searchSubscriptionNotifications';

async function main() {
  const raw = process.env.LISTING_ID ?? process.argv[2];
  const listingId = raw ? parseInt(String(raw).replace(/^--listing=/, ''), 10) : NaN;
  if (Number.isNaN(listingId)) {
    console.error('Usage: LISTING_ID=<id> npx tsx scripts/test-search-subscription-notify.ts');
    process.exit(1);
  }

  const result = await notifySearchSubscribersForListingId(listingId);
  console.log('Result:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
