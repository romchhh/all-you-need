import { Category } from '@/types';

export type TickerMessageType = 'system' | 'activity' | 'tips';

export type TickerMessage = {
  id: string;
  text: string;
  emoji: string;
  type: TickerMessageType;
};

type ActivityData = {
  newListingsToday: number;
  newListingsByCity: Array<{ city: string; count: number }>;
  newListingsByCategory: Array<{ category: string; count: number }>;
};

const SYSTEM_KEYS = [
  'platformTicker.system.marketplace',
  'platformTicker.system.freeListing',
  'platformTicker.system.community',
  'platformTicker.system.germany',
  'platformTicker.system.safeDeals',
  'platformTicker.system.telegram',
] as const;

const SYSTEM_EMOJI: Record<(typeof SYSTEM_KEYS)[number], string> = {
  'platformTicker.system.marketplace': '🏪',
  'platformTicker.system.freeListing': '🚀',
  'platformTicker.system.community': '👥',
  'platformTicker.system.germany': '🇩🇪',
  'platformTicker.system.safeDeals': '💬',
  'platformTicker.system.telegram': '📱',
};

/** Поради з емодзі (без Info-іконки). */
const TIP_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.tips.useSearch', emoji: '🔎' },
  { key: 'platformTicker.tips.useFilters', emoji: '🎯' },
  { key: 'platformTicker.tips.pickCity', emoji: '📍' },
  { key: 'platformTicker.tips.browseCategories', emoji: '🗂' },
  { key: 'platformTicker.tips.findFaster', emoji: '⚡' },
  { key: 'platformTicker.tips.tryServices', emoji: '🧠' },
  { key: 'platformTicker.tips.switchView', emoji: '📱' },
  { key: 'platformTicker.tips.addFavorites', emoji: '⭐' },
  { key: 'platformTicker.tips.saveListings', emoji: '❤️' },
  { key: 'platformTicker.tips.subscribeCity', emoji: '🔔' },
  { key: 'platformTicker.tips.enableNotifications', emoji: '📡' },
  { key: 'platformTicker.tips.watchNew', emoji: '👀' },
  { key: 'platformTicker.tips.postFree', emoji: '🚀' },
  { key: 'platformTicker.tips.vipViews', emoji: '⭐' },
  { key: 'platformTicker.tips.promoteListing', emoji: '📈' },
  { key: 'platformTicker.tips.adsReach', emoji: '🔥' },
  { key: 'platformTicker.tips.autoRenew', emoji: '🔄' },
  { key: 'platformTicker.tips.bumpListing', emoji: '⚡' },
  { key: 'platformTicker.tips.inviteFriends', emoji: '🎁' },
  { key: 'platformTicker.tips.referralBonus', emoji: '👥' },
  { key: 'platformTicker.tips.growProfile', emoji: '🚀' },
];

const TARGET_RATIO: Record<TickerMessageType, number> = {
  system: 0.15,
  activity: 0.55,
  tips: 0.3,
};

const SERVICES_CATEGORY_IDS = new Set(['services_work', 'beauty_wellness']);

function buildLiveMarketplaceTips(
  t: (key: string, params?: Record<string, string>) => string,
  categories: Category[],
  activity: ActivityData
): TickerMessage[] {
  const out: TickerMessage[] = [];
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name || id;

  const topCity = activity.newListingsByCity.find((r) => r.city && r.count > 0);
  const topCategory = activity.newListingsByCategory.find((r) => r.category && r.count > 0);

  if (topCategory) {
    const name = categoryName(topCategory.category);
    out.push({
      id: `live:cat-active:${topCategory.category}`,
      text: t('platformTicker.tips.liveCategoryActive', { category: name }),
      emoji: '🔥',
      type: 'activity',
    });
  }

  if (topCity) {
    out.push({
      id: `live:city-news:${topCity.city}`,
      text: t('platformTicker.tips.liveCityNews', { city: topCity.city }),
      emoji: '🚀',
      type: 'activity',
    });
  }

  if (activity.newListingsToday > 0) {
    out.push(
      {
        id: 'live:nearby',
        text: t('platformTicker.tips.liveNearby'),
        emoji: '📍',
        type: 'activity',
      },
      {
        id: 'live:fresh',
        text: t('platformTicker.tips.liveFresh'),
        emoji: '🆕',
        type: 'activity',
      },
      {
        id: 'live:catalog',
        text: t('platformTicker.tips.liveCatalog'),
        emoji: '⚡',
        type: 'activity',
      },
      {
        id: 'live:new-listings',
        text: t('platformTicker.tips.liveNewListings'),
        emoji: '📦',
        type: 'activity',
      }
    );

    const hasServices = activity.newListingsByCategory.some((r) =>
      SERVICES_CATEGORY_IDS.has(r.category)
    );
    if (hasServices) {
      out.push({
        id: 'live:new-services',
        text: t('platformTicker.tips.liveNewServices'),
        emoji: '💡',
        type: 'activity',
      });
    }
  }

  return out;
}

export function buildTickerMessages(
  t: (key: string, params?: Record<string, string>) => string,
  categories: Category[],
  activity: ActivityData
): TickerMessage[] {
  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name || id;

  const system: TickerMessage[] = SYSTEM_KEYS.map((key) => ({
    id: key,
    text: t(key),
    emoji: SYSTEM_EMOJI[key],
    type: 'system' as const,
  }));

  const tips: TickerMessage[] = TIP_ENTRIES.map(({ key, emoji }) => ({
    id: key,
    text: t(key),
    emoji,
    type: 'tips' as const,
  }));

  const activityMsgs: TickerMessage[] = [];

  if (activity.newListingsToday > 0) {
    activityMsgs.push({
      id: 'activity:newToday',
      text: t('platformTicker.activity.newToday', { count: String(activity.newListingsToday) }),
      emoji: '🆕',
      type: 'activity',
    });
  }

  for (const row of activity.newListingsByCity) {
    if (!row.city || row.count <= 0) continue;
    activityMsgs.push({
      id: `activity:city:${row.city}`,
      text: t('platformTicker.activity.cityToday', { city: row.city, count: String(row.count) }),
      emoji: '📍',
      type: 'activity',
    });
  }

  for (const row of activity.newListingsByCategory) {
    if (!row.category || row.count <= 0) continue;
    const name = categoryName(row.category);
    activityMsgs.push({
      id: `activity:cat:${row.category}`,
      text: t('platformTicker.activity.categoryToday', {
        category: name,
        count: String(row.count),
      }),
      emoji: '🔥',
      type: 'activity',
    });
  }

  activityMsgs.push(...buildLiveMarketplaceTips(t, categories, activity));

  if (activityMsgs.length === 0) {
    activityMsgs.push({
      id: 'activity:fallback',
      text: t('platformTicker.activity.explore'),
      emoji: '🔎',
      type: 'activity',
    });
  }

  return [...system, ...activityMsgs, ...tips];
}

export function pickNextTickerMessage(
  pools: Record<TickerMessageType, TickerMessage[]>,
  shown: Set<string>,
  typeCounts: Record<TickerMessageType, number>
): TickerMessage | null {
  const total = typeCounts.system + typeCounts.activity + typeCounts.tips;
  const types: TickerMessageType[] = ['system', 'activity', 'tips'];

  types.sort((a, b) => {
    const ratioA = total > 0 ? typeCounts[a] / total : 0;
    const ratioB = total > 0 ? typeCounts[b] / total : 0;
    return TARGET_RATIO[b] - ratioB - (TARGET_RATIO[a] - ratioA);
  });

  for (const type of types) {
    const available = pools[type].filter((m) => !shown.has(m.id));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }

  return null;
}

export function groupTickerMessages(messages: TickerMessage[]): Record<TickerMessageType, TickerMessage[]> {
  return {
    system: messages.filter((m) => m.type === 'system'),
    activity: messages.filter((m) => m.type === 'activity'),
    tips: messages.filter((m) => m.type === 'tips'),
  };
}

export function randomTickerIntervalMs(): number {
  return 8000 + Math.floor(Math.random() * 4000);
}

export const WELCOME_TICKER_EMOJI = '✨';
