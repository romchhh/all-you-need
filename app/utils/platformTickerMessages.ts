import { Category } from '@/types';

export type TickerMessageType = 'system' | 'activity' | 'tips';

export type TickerMessage = {
  id: string;
  text: string;
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

const TIPS_KEYS = [
  'platformTicker.tips.favorites',
  'platformTicker.tips.cityFilter',
  'platformTicker.tips.categories',
  'platformTicker.tips.photos',
  'platformTicker.tips.price',
  'platformTicker.tips.share',
] as const;

const TARGET_RATIO: Record<TickerMessageType, number> = {
  system: 0.2,
  activity: 0.6,
  tips: 0.2,
};

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
    type: 'system' as const,
  }));

  const tips: TickerMessage[] = TIPS_KEYS.map((key) => ({
    id: key,
    text: t(key),
    type: 'tips' as const,
  }));

  const activityMsgs: TickerMessage[] = [];

  if (activity.newListingsToday > 0) {
    activityMsgs.push({
      id: 'activity:newToday',
      text: t('platformTicker.activity.newToday', { count: String(activity.newListingsToday) }),
      type: 'activity',
    });
  }

  for (const row of activity.newListingsByCity) {
    if (!row.city || row.count <= 0) continue;
    activityMsgs.push({
      id: `activity:city:${row.city}`,
      text: t('platformTicker.activity.cityToday', { city: row.city, count: String(row.count) }),
      type: 'activity',
    });
  }

  for (const row of activity.newListingsByCategory) {
    if (!row.category || row.count <= 0) continue;
    const name = categoryName(row.category);
    activityMsgs.push({
      id: `activity:cat:${row.category}`,
      text: t('platformTicker.activity.categoryToday', { category: name, count: String(row.count) }),
      type: 'activity',
    });
  }

  if (activityMsgs.length === 0) {
    activityMsgs.push({
      id: 'activity:fallback',
      text: t('platformTicker.activity.explore'),
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
