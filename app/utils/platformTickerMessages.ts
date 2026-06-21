import { Category } from '@/types';

export type TickerMessageType =
  | 'activity'
  | 'platform'
  | 'listing'
  | 'ads'
  | 'navigation'
  | 'referral'
  | 'subscriptions'
  | 'favorites';

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

export const TICKER_MESSAGE_TYPES: TickerMessageType[] = [
  'activity',
  'platform',
  'listing',
  'ads',
  'navigation',
  'referral',
  'subscriptions',
  'favorites',
];

const TARGET_RATIO: Record<TickerMessageType, number> = {
  activity: 0.4,
  platform: 0.15,
  listing: 0.15,
  ads: 0.1,
  navigation: 0.1,
  referral: 0.05,
  subscriptions: 0.03,
  favorites: 0.02,
};

const PLATFORM_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.platform.germanyWide', emoji: '📍' },
  { key: 'platformTicker.platform.telegramChat', emoji: '💬' },
  { key: 'platformTicker.platform.goodsAndServices', emoji: '🏠' },
  { key: 'platformTicker.platform.community', emoji: '🇺🇦' },
  { key: 'platformTicker.platform.thousandsListings', emoji: '📦' },
  { key: 'platformTicker.platform.lifeInGermany', emoji: '🇩🇪' },
  { key: 'platformTicker.platform.buySellServices', emoji: '🏠' },
  { key: 'platformTicker.platform.alwaysUpdating', emoji: '✨' },
  { key: 'platformTicker.platform.newEveryDay', emoji: '🆕' },
];

const NAVIGATION_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.navigation.pickCityNearby', emoji: '📍' },
  { key: 'platformTicker.navigation.filtersFaster', emoji: '🎯' },
  { key: 'platformTicker.navigation.cityAffectsSearch', emoji: '📌' },
  { key: 'platformTicker.navigation.categoriesHelp', emoji: '📂' },
  { key: 'platformTicker.navigation.searchAllCategories', emoji: '⚡' },
];

const FAVORITES_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.favorites.saveInteresting', emoji: '❤️' },
  { key: 'platformTicker.favorites.dontLoseOffers', emoji: '❤️' },
];

const SUBSCRIPTIONS_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.subscriptions.subscribeCity', emoji: '🔔' },
  { key: 'platformTicker.subscriptions.dontMissCity', emoji: '🔔' },
];

const LISTING_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.listing.postFree', emoji: '➕' },
  { key: 'platformTicker.listing.addInMinutes', emoji: '🚀' },
  { key: 'platformTicker.listing.tellAboutServices', emoji: '📢' },
  { key: 'platformTicker.listing.sellEasily', emoji: '🛍️' },
  { key: 'platformTicker.listing.findClients', emoji: '💅' },
];

const ADS_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.ads.vipMoreViews', emoji: '🚀' },
  { key: 'platformTicker.ads.makeNoticeable', emoji: '⭐' },
  { key: 'platformTicker.ads.promoteListings', emoji: '⭐' },
  { key: 'platformTicker.ads.bumpToTop', emoji: '🚀' },
  { key: 'platformTicker.ads.findClientsFaster', emoji: '🚀' },
  { key: 'platformTicker.ads.sellFaster', emoji: '🚀' },
  { key: 'platformTicker.ads.adsHelpClients', emoji: '⭐' },
];

const REFERRAL_ENTRIES: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'platformTicker.referral.shareBonuses', emoji: '🎁' },
  { key: 'platformTicker.referral.inviteFriend', emoji: '🎁' },
  { key: 'platformTicker.referral.shareViaTelegram', emoji: '📲' },
  { key: 'platformTicker.referral.helpFriends', emoji: '📲' },
];

export type TickerCategoryInfo = {
  type: TickerMessageType;
  emoji: string;
  sharePercent: number;
  titleKey: string;
  descriptionKey: string;
  messageKeys: string[];
  dynamicMessageKeys?: string[];
};

export const TICKER_CATEGORIES_INFO: TickerCategoryInfo[] = [
  {
    type: 'activity',
    emoji: '📊',
    sharePercent: 40,
    titleKey: 'platformTicker.info.categories.activity.title',
    descriptionKey: 'platformTicker.info.categories.activity.description',
    messageKeys: [],
    dynamicMessageKeys: [
      'platformTicker.info.categories.activity.examples.newToday',
      'platformTicker.info.categories.activity.examples.byCity',
      'platformTicker.info.categories.activity.examples.byCategory',
      'platformTicker.info.categories.activity.examples.cityLeader',
      'platformTicker.info.categories.activity.examples.categoryLeader',
    ],
  },
  {
    type: 'platform',
    emoji: '🏪',
    sharePercent: 15,
    titleKey: 'platformTicker.info.categories.platform.title',
    descriptionKey: 'platformTicker.info.categories.platform.description',
    messageKeys: PLATFORM_ENTRIES.map((entry) => entry.key),
  },
  {
    type: 'listing',
    emoji: '➕',
    sharePercent: 15,
    titleKey: 'platformTicker.info.categories.listing.title',
    descriptionKey: 'platformTicker.info.categories.listing.description',
    messageKeys: LISTING_ENTRIES.map((entry) => entry.key),
  },
  {
    type: 'ads',
    emoji: '⭐',
    sharePercent: 10,
    titleKey: 'platformTicker.info.categories.ads.title',
    descriptionKey: 'platformTicker.info.categories.ads.description',
    messageKeys: ADS_ENTRIES.map((entry) => entry.key),
  },
  {
    type: 'navigation',
    emoji: '🔎',
    sharePercent: 10,
    titleKey: 'platformTicker.info.categories.navigation.title',
    descriptionKey: 'platformTicker.info.categories.navigation.description',
    messageKeys: NAVIGATION_ENTRIES.map((entry) => entry.key),
  },
  {
    type: 'referral',
    emoji: '🎁',
    sharePercent: 5,
    titleKey: 'platformTicker.info.categories.referral.title',
    descriptionKey: 'platformTicker.info.categories.referral.description',
    messageKeys: REFERRAL_ENTRIES.map((entry) => entry.key),
  },
  {
    type: 'subscriptions',
    emoji: '🔔',
    sharePercent: 3,
    titleKey: 'platformTicker.info.categories.subscriptions.title',
    descriptionKey: 'platformTicker.info.categories.subscriptions.description',
    messageKeys: SUBSCRIPTIONS_ENTRIES.map((entry) => entry.key),
  },
  {
    type: 'favorites',
    emoji: '❤️',
    sharePercent: 2,
    titleKey: 'platformTicker.info.categories.favorites.title',
    descriptionKey: 'platformTicker.info.categories.favorites.description',
    messageKeys: FAVORITES_ENTRIES.map((entry) => entry.key),
  },
];

function mapEntries(
  entries: ReadonlyArray<{ key: string; emoji: string }>,
  type: TickerMessageType,
  t: (key: string, params?: Record<string, string>) => string
): TickerMessage[] {
  return entries.map(({ key, emoji }) => ({
    id: key,
    text: t(key),
    emoji,
    type,
  }));
}

function buildActivityMessages(
  t: (key: string, params?: Record<string, string>) => string,
  categories: Category[],
  activity: ActivityData
): TickerMessage[] {
  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name || id;

  const messages: TickerMessage[] = [];

  if (activity.newListingsToday > 0) {
    messages.push({
      id: 'activity:newToday',
      text: t('platformTicker.activity.newToday', {
        count: String(activity.newListingsToday),
      }),
      emoji: '🆕',
      type: 'activity',
    });
  }

  for (const row of activity.newListingsByCity) {
    if (!row.city || row.count <= 0) continue;
    messages.push({
      id: `activity:city:${row.city}`,
      text: t('platformTicker.activity.cityToday', {
        city: row.city,
        count: String(row.count),
      }),
      emoji: '📍',
      type: 'activity',
    });
  }

  for (const row of activity.newListingsByCategory) {
    if (!row.category || row.count <= 0) continue;
    messages.push({
      id: `activity:cat:${row.category}`,
      text: t('platformTicker.activity.categoryToday', {
        category: categoryName(row.category),
        count: String(row.count),
      }),
      emoji: '🔥',
      type: 'activity',
    });
  }

  const topCity = activity.newListingsByCity.find((row) => row.city && row.count > 0);
  if (topCity) {
    messages.push({
      id: `activity:cityLeader:${topCity.city}`,
      text: t('platformTicker.activity.cityLeader', {
        city: topCity.city,
        count: String(topCity.count),
      }),
      emoji: '🏙️',
      type: 'activity',
    });
  }

  const topCategory = activity.newListingsByCategory.find(
    (row) => row.category && row.count > 0
  );
  if (topCategory) {
    messages.push({
      id: `activity:categoryLeader:${topCategory.category}`,
      text: t('platformTicker.activity.categoryLeader', {
        category: categoryName(topCategory.category),
        count: String(topCategory.count),
      }),
      emoji: '👑',
      type: 'activity',
    });
  }

  if (messages.length === 0) {
    messages.push({
      id: 'activity:fallback',
      text: t('platformTicker.activity.explore'),
      emoji: '🔎',
      type: 'activity',
    });
  }

  return messages;
}

export function buildTickerMessages(
  t: (key: string, params?: Record<string, string>) => string,
  categories: Category[],
  activity: ActivityData
): TickerMessage[] {
  return [
    ...buildActivityMessages(t, categories, activity),
    ...mapEntries(PLATFORM_ENTRIES, 'platform', t),
    ...mapEntries(LISTING_ENTRIES, 'listing', t),
    ...mapEntries(ADS_ENTRIES, 'ads', t),
    ...mapEntries(NAVIGATION_ENTRIES, 'navigation', t),
    ...mapEntries(REFERRAL_ENTRIES, 'referral', t),
    ...mapEntries(SUBSCRIPTIONS_ENTRIES, 'subscriptions', t),
    ...mapEntries(FAVORITES_ENTRIES, 'favorites', t),
  ];
}

export function pickNextTickerMessage(
  pools: Record<TickerMessageType, TickerMessage[]>,
  shown: Set<string>,
  typeCounts: Record<TickerMessageType, number>
): TickerMessage | null {
  const total = TICKER_MESSAGE_TYPES.reduce((sum, type) => sum + typeCounts[type], 0);
  const types = [...TICKER_MESSAGE_TYPES];

  types.sort((a, b) => {
    const ratioA = total > 0 ? typeCounts[a] / total : 0;
    const ratioB = total > 0 ? typeCounts[b] / total : 0;
    return TARGET_RATIO[b] - ratioB - (TARGET_RATIO[a] - ratioA);
  });

  for (const type of types) {
    const available = pools[type].filter((message) => !shown.has(message.id));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }

  return null;
}

export function groupTickerMessages(
  messages: TickerMessage[]
): Record<TickerMessageType, TickerMessage[]> {
  const grouped = createEmptyTickerPools();
  for (const message of messages) {
    grouped[message.type].push(message);
  }
  return grouped;
}

export function createEmptyTickerPools(): Record<TickerMessageType, TickerMessage[]> {
  return Object.fromEntries(
    TICKER_MESSAGE_TYPES.map((type) => [type, [] as TickerMessage[]])
  ) as Record<TickerMessageType, TickerMessage[]>;
}

export function createEmptyTickerTypeCounts(): Record<TickerMessageType, number> {
  return Object.fromEntries(
    TICKER_MESSAGE_TYPES.map((type) => [type, 0])
  ) as Record<TickerMessageType, number>;
}

export function randomTickerIntervalMs(): number {
  return 8000 + Math.floor(Math.random() * 4000);
}

export const WELCOME_TICKER_EMOJI = '✨';
