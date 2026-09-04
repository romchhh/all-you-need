import { prisma, executeWithRetry } from '@/lib/prisma';
import type { AnalyticsEventGroup, AnalyticsEventName } from '@/constants/analyticsEvents';

export type AnalyticsEventInput = {
  eventName: AnalyticsEventName | string;
  eventGroup?: AnalyticsEventGroup | string;
  telegramId?: string | number | null;
  userId?: number | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

let analyticsTableReady = false;

export async function ensureAnalyticsEventTable(): Promise<void> {
  if (analyticsTableReady) return;

  try {
    const tableInfo = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='AnalyticsEvent'`
      )
    )) as Array<{ name: string }>;

    if (tableInfo.length === 0) {
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS AnalyticsEvent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            eventName TEXT NOT NULL,
            eventGroup TEXT,
            userId INTEGER,
            telegramId TEXT,
            entityType TEXT,
            entityId TEXT,
            metadata TEXT,
            createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `)
      );

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON AnalyticsEvent(eventName)`
        )
      ).catch(() => {});

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON AnalyticsEvent(createdAt)`
        )
      ).catch(() => {});

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS idx_analytics_entity ON AnalyticsEvent(entityType, entityId)`
        )
      ).catch(() => {});
    }

    analyticsTableReady = true;
  } catch {
    analyticsTableReady = true;
  }
}

export async function insertAnalyticsEvent(input: AnalyticsEventInput): Promise<void> {
  await ensureAnalyticsEventTable();

  const metadata =
    input.metadata && Object.keys(input.metadata).length > 0
      ? JSON.stringify(input.metadata)
      : null;

  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `INSERT INTO AnalyticsEvent (eventName, eventGroup, userId, telegramId, entityType, entityId, metadata, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      input.eventName,
      input.eventGroup ?? null,
      input.userId ?? null,
      input.telegramId != null ? String(input.telegramId) : null,
      input.entityType ?? null,
      input.entityId ?? null,
      metadata
    )
  );
}

export type AnalyticsSummary = {
  totalEvents: number;
  periodDays: number;
  uniqueUsers: number;
  avgEventsPerDay: number;
  byEvent: Array<{ eventName: string; count: number }>;
  byEventGroup: Array<{ eventGroup: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  topContactListings: Array<{ listingId: string; title: string | null; count: number }>;
  topViewedListings: Array<{ listingId: string; title: string | null; count: number }>;
  topSearches: Array<{ query: string; count: number }>;
  dailyEvents: Array<{ date: string; count: number }>;
  recentEvents: Array<{
    id: number;
    eventName: string;
    entityType: string | null;
    entityId: string | null;
    metadata: string | null;
    createdAt: string;
  }>;
};

export async function getAnalyticsSummary(days = 30): Promise<AnalyticsSummary> {
  await ensureAnalyticsEventTable();

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().replace('T', ' ').substring(0, 19);

  const totalRows = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM AnalyticsEvent WHERE datetime(createdAt) >= datetime(?)`,
      sinceIso
    )
  )) as Array<{ count: number }>;

  const uniqueRows = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT COALESCE(telegramId, 'uid:' || userId)) as count
       FROM AnalyticsEvent
       WHERE datetime(createdAt) >= datetime(?)
         AND (telegramId IS NOT NULL OR userId IS NOT NULL)`,
      sinceIso
    )
  ).catch(() => [{ count: 0 }])) as Array<{ count: number }>;

  const byEventGroup = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(eventGroup, 'other') as eventGroup, COUNT(*) as count
       FROM AnalyticsEvent
       WHERE datetime(createdAt) >= datetime(?)
       GROUP BY eventGroup
       ORDER BY count DESC`,
      sinceIso
    )
  ).catch(() => [])) as Array<{ eventGroup: string; count: number }>;

  const topSearches = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT entityId as query, COUNT(*) as count
       FROM AnalyticsEvent
       WHERE datetime(createdAt) >= datetime(?)
         AND eventName = 'search_submit'
         AND entityType = 'query'
         AND entityId IS NOT NULL AND TRIM(entityId) != ''
       GROUP BY entityId
       ORDER BY count DESC
       LIMIT 15`,
      sinceIso
    )
  ).catch(() => [])) as Array<{ query: string; count: number }>;

  const byEvent = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT eventName, COUNT(*) as count
       FROM AnalyticsEvent
       WHERE datetime(createdAt) >= datetime(?)
       GROUP BY eventName
       ORDER BY count DESC
       LIMIT 30`,
      sinceIso
    )
  )) as Array<{ eventName: string; count: number }>;

  const topCategories = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT entityId as category, COUNT(*) as count
       FROM AnalyticsEvent
       WHERE datetime(createdAt) >= datetime(?)
         AND eventName IN ('category_click', 'subcategory_click')
         AND entityType = 'category'
       GROUP BY entityId
       ORDER BY count DESC
       LIMIT 15`,
      sinceIso
    )
  )) as Array<{ category: string; count: number }>;

  const topContactListings = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT ae.entityId as listingId,
              l.title as title,
              COUNT(*) as count
       FROM AnalyticsEvent ae
       LEFT JOIN Listing l ON l.id = CAST(ae.entityId AS INTEGER)
       WHERE datetime(ae.createdAt) >= datetime(?)
         AND ae.eventName = 'contact_seller'
         AND ae.entityType = 'listing'
       GROUP BY ae.entityId
       ORDER BY count DESC
       LIMIT 15`,
      sinceIso
    )
  )) as Array<{ listingId: string; title: string | null; count: number }>;

  const topViewedListings = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT ae.entityId as listingId,
              l.title as title,
              COUNT(*) as count
       FROM AnalyticsEvent ae
       LEFT JOIN Listing l ON l.id = CAST(ae.entityId AS INTEGER)
       WHERE datetime(ae.createdAt) >= datetime(?)
         AND ae.eventName = 'listing_view'
         AND ae.entityType = 'listing'
       GROUP BY ae.entityId
       ORDER BY count DESC
       LIMIT 15`,
      sinceIso
    )
  ).catch(() => [])) as Array<{ listingId: string; title: string | null; count: number }>;

  const dailyEvents = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT date(createdAt) as date, COUNT(*) as count
       FROM AnalyticsEvent
       WHERE datetime(createdAt) >= datetime(?)
       GROUP BY date(createdAt)
       ORDER BY date ASC`,
      sinceIso
    )
  )) as Array<{ date: string; count: number }>;

  const recentEvents = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT id, eventName, entityType, entityId, metadata, createdAt
       FROM AnalyticsEvent
       ORDER BY datetime(createdAt) DESC
       LIMIT 50`
    )
  )) as AnalyticsSummary['recentEvents'];

  const totalEvents = Number(totalRows[0]?.count ?? 0);

  return {
    totalEvents,
    periodDays: days,
    uniqueUsers: Number(uniqueRows[0]?.count ?? 0),
    avgEventsPerDay: days > 0 ? Math.round((totalEvents / days) * 10) / 10 : 0,
    byEvent: byEvent.map((row) => ({
      eventName: row.eventName,
      count: Number(row.count),
    })),
    byEventGroup: byEventGroup.map((row) => ({
      eventGroup: row.eventGroup,
      count: Number(row.count),
    })),
    topCategories: topCategories.map((row) => ({
      category: row.category,
      count: Number(row.count),
    })),
    topContactListings: topContactListings.map((row) => ({
      listingId: row.listingId,
      title: row.title,
      count: Number(row.count),
    })),
    topViewedListings: topViewedListings.map((row) => ({
      listingId: row.listingId,
      title: row.title,
      count: Number(row.count),
    })),
    topSearches: topSearches.map((row) => ({
      query: row.query,
      count: Number(row.count),
    })),
    dailyEvents: dailyEvents.map((row) => ({
      date: row.date,
      count: Number(row.count),
    })),
    recentEvents,
  };
}
