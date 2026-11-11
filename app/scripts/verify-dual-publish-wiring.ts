/**
 * Статична перевірка наявності точок дублювання (без Telegram/БД).
 * Запуск: npx tsx scripts/verify-dual-publish-wiring.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

type Check = { name: string; file: string; needle: string };

const checks: Check[] = [
  {
    name: 'Web approve → channels',
    file: 'app/lib/moderation/moderationHelpers.ts',
    needle: 'publishMarketplaceListingToChannels',
  },
  {
    name: 'Bot approve marketplace → channels',
    file: 'bot/utils/moderation_manager.py',
    needle: 'publish_marketplace_listing_to_channels',
  },
  {
    name: 'Bot approve telegram → marketplace',
    file: 'bot/utils/moderation_manager.py',
    needle: 'ensure_marketplace_listing_from_telegram',
  },
  {
    name: 'Telegram channel publish uses Listing id',
    file: 'bot/utils/moderation_manager.py',
    needle: 'listing_miniapp_url(marketplace_listing_id)',
  },
  {
    name: 'Search notify on web approve',
    file: 'app/lib/moderation/moderationHelpers.ts',
    needle: 'notifySearchSubscribersOfNewMarketplaceListing',
  },
  {
    name: 'Search notify cron for bot/parser',
    file: 'bot/parser/notify/search_subscription.py',
    needle: '/api/cron/notify-search-subscribers',
  },
  {
    name: 'Distribute API',
    file: 'app/app/api/listings/[id]/distribute/route.ts',
    needle: 'sendPhoto',
  },
];

let failed = 0;
for (const c of checks) {
  const full = path.join(root, c.file);
  const text = fs.readFileSync(full, 'utf8');
  if (text.includes(c.needle)) {
    console.log('OK', c.name);
  } else {
    console.error('FAIL', c.name, '— missing', c.needle, 'in', c.file);
    failed += 1;
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log('All wiring checks passed.');
