/**
 * Профіль інтересів користувача для персоналізованого каталогу.
 * Джерела: перегляди, обране, analytics, підписки на міста.
 */

import { prisma } from '@/lib/prisma';
import { queryRawUnsafe } from '@/lib/prisma';
import { isPostgres } from '@/lib/dbSql';

export type UserPersonalizationProfile = {
  categoryScores: Record<string, number>;
  subcategoryScores: Record<string, number>;
  cityScores: Record<string, number>;
  viewedListingIds: number[];
  searchTerms: string[];
  hasSignals: boolean;
};

export type PersonalizationOrderBoost = {
  sql: string;
  params: unknown[];
};

const PROFILE_CACHE_MS = 30 * 60 * 1000;
const profileCache = new Map<string, { at: number; profile: UserPersonalizationProfile }>();

function emptyProfile(): UserPersonalizationProfile {
  return {
    categoryScores: {},
    subcategoryScores: {},
    cityScores: {},
    viewedListingIds: [],
    searchTerms: [],
    hasSignals: false,
  };
}

function bumpScore(map: Record<string, number>, key: string | null | undefined, delta: number) {
  const k = (key || '').trim();
  if (!k) return;
  map[k] = (map[k] || 0) + delta;
}

function topScores(map: Record<string, number>, limit: number): Array<[string, number]> {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function shouldPersonalizeCatalogFeed(params: {
  viewerId: string | null;
  sortBy: string;
  search: string | null;
  category: string | null;
  subcategory: string | null;
  feedMode: string | null;
}): boolean {
  if (params.sortBy !== 'newest') return false;
  if (params.search?.trim()) return false;
  if (params.category || params.subcategory) return false;
  if (params.feedMode === 'new') return false;
  return params.feedMode === 'forYou';
}

export async function loadUserPersonalizationProfile(
  telegramId: string
): Promise<UserPersonalizationProfile> {
  const tid = telegramId.trim();
  if (!tid) return emptyProfile();

  const cached = profileCache.get(tid);
  if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) {
    return cached.profile;
  }

  const viewerNum = parseInt(tid, 10);
  if (Number.isNaN(viewerNum)) return emptyProfile();

  const profile = emptyProfile();

  try {
    const userRows = (await queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS TEXT) = ? LIMIT 1`,
      tid
    )) as Array<{ id: number }>;
    const userId = userRows[0]?.id;

    const viewedSince = isPostgres()
      ? `vh."viewedAt" >= NOW() - INTERVAL '60 days'`
      : `datetime(vh.viewedAt) >= datetime('now', '-60 days')`;

    const views = (await queryRawUnsafe(
      `SELECT vh.listingId as listingId, l.category, l.subcategory, l.location
       FROM ViewHistory vh
       JOIN Listing l ON l.id = vh.listingId
       WHERE vh.viewerTelegramId = ?
         AND ${viewedSince}
       ORDER BY vh.viewedAt DESC
       LIMIT 100`,
      viewerNum
    )) as Array<{
      listingId: number;
      category: string;
      subcategory: string | null;
      location: string;
    }>;

    for (const row of views) {
      profile.viewedListingIds.push(Number(row.listingId));
      bumpScore(profile.categoryScores, row.category, 3);
      bumpScore(profile.subcategoryScores, row.subcategory, 2);
      bumpScore(profile.cityScores, row.location, 2);
    }

    if (userId) {
      const favorites = (await queryRawUnsafe(
        `SELECT l.category, l.subcategory, l.location
         FROM Favorite f
         JOIN Listing l ON l.id = f.listingId
         WHERE f.userId = ?
         ORDER BY f.createdAt DESC
         LIMIT 40`,
        userId
      )) as Array<{
        category: string;
        subcategory: string | null;
        location: string;
      }>;

      for (const row of favorites) {
        bumpScore(profile.categoryScores, row.category, 6);
        bumpScore(profile.subcategoryScores, row.subcategory, 4);
        bumpScore(profile.cityScores, row.location, 4);
      }

      const subs = (await queryRawUnsafe(
        `SELECT cityKey FROM CitySubscription WHERE userId = ?`,
        userId
      )) as Array<{ cityKey: string }>;

      for (const row of subs) {
        bumpScore(profile.cityScores, row.cityKey, 14);
      }
    }

    const eventsSince = isPostgres()
      ? `createdAt >= NOW() - INTERVAL '45 days'`
      : `createdAt >= datetime('now', '-45 days')`;

    const events = (await queryRawUnsafe(
      `SELECT eventName, entityId, metadata
       FROM AnalyticsEvent
       WHERE ${eventsSince}
         AND (
           telegramId = ?
           ${userId ? 'OR userId = ?' : ''}
         )
         AND eventName IN (
           'category_click',
           'subcategory_click',
           'search_submit',
           'listing_view',
           'favorite_add',
           'contact_seller'
         )
       ORDER BY createdAt DESC
       LIMIT 150`,
      ...(userId ? [tid, userId] : [tid])
    )) as Array<{
      eventName: string;
      entityId: string | null;
      metadata: string | null;
    }>;

    const termSet = new Set<string>();

    for (const ev of events) {
      const meta = parseMetadata(ev.metadata);
      switch (ev.eventName) {
        case 'category_click':
          bumpScore(profile.categoryScores, ev.entityId, 5);
          break;
        case 'subcategory_click':
          bumpScore(profile.subcategoryScores, ev.entityId, 7);
          if (typeof meta.parentCategory === 'string') {
            bumpScore(profile.categoryScores, meta.parentCategory, 3);
          }
          break;
        case 'listing_view':
          if (typeof meta.category === 'string') {
            bumpScore(profile.categoryScores, meta.category, 2);
          }
          break;
        case 'favorite_add':
          if (typeof meta.category === 'string') {
            bumpScore(profile.categoryScores, meta.category, 4);
          }
          break;
        case 'contact_seller':
          if (typeof meta.category === 'string') {
            bumpScore(profile.categoryScores, meta.category, 8);
          }
          if (typeof meta.subcategory === 'string') {
            bumpScore(profile.subcategoryScores, meta.subcategory, 6);
          }
          if (typeof meta.location === 'string') {
            bumpScore(profile.cityScores, meta.location, 5);
          }
          break;
        case 'search_submit': {
          const q = (ev.entityId || (meta.query as string) || '').trim().toLowerCase();
          if (q.length >= 2 && q.length <= 40) {
            termSet.add(q);
          }
          break;
        }
        default:
          break;
      }
    }

    profile.searchTerms = [...termSet].slice(0, 6);

    if (userId) {
      const contactsSince = isPostgres()
        ? `ae.createdAt >= NOW() - INTERVAL '60 days'`
        : `ae.createdAt >= datetime('now', '-60 days')`;
      const contacts = (await queryRawUnsafe(
        `SELECT l.category, l.subcategory, l.location
         FROM AnalyticsEvent ae
         JOIN Listing l ON l.id = CAST(ae.entityId AS INTEGER)
         WHERE ${contactsSince}
           AND ae.eventName = 'contact_seller'
           AND (ae.telegramId = ? OR ae.userId = ?)
         ORDER BY ae.createdAt DESC
         LIMIT 30`,
        tid,
        userId
      )) as Array<{
        category: string;
        subcategory: string | null;
        location: string;
      }>;

      for (const row of contacts) {
        bumpScore(profile.categoryScores, row.category, 8);
        bumpScore(profile.subcategoryScores, row.subcategory, 6);
        bumpScore(profile.cityScores, row.location, 5);
      }
    }

    profile.hasSignals =
      views.length > 0 ||
      events.length > 0 ||
      Object.keys(profile.categoryScores).length > 0 ||
      Object.keys(profile.cityScores).length > 0;

    profileCache.set(tid, { at: Date.now(), profile });
    if (profileCache.size > 200) {
      const oldest = [...profileCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) profileCache.delete(oldest[0]);
    }
  } catch (error) {
    console.error('[personalization] load profile failed:', error);
  }

  return profile;
}

export function buildPersonalizationOrderBoost(
  profile: UserPersonalizationProfile | null
): PersonalizationOrderBoost | null {
  if (!profile?.hasSignals) return null;

  const parts: string[] = ['0'];
  const params: unknown[] = [];

  for (const [cat, weight] of topScores(profile.categoryScores, 5)) {
    parts.push('CASE WHEN l.category = ? THEN ? ELSE 0 END');
    params.push(cat, Math.min(Math.round(weight * 2.5), 35));
  }

  for (const [sub, weight] of topScores(profile.subcategoryScores, 5)) {
    parts.push('CASE WHEN l.subcategory = ? THEN ? ELSE 0 END');
    params.push(sub, Math.min(Math.round(weight * 2), 25));
  }

  for (const [city, weight] of topScores(profile.cityScores, 4)) {
    parts.push('CASE WHEN l.location LIKE ? THEN ? ELSE 0 END');
    params.push(`%${city}%`, Math.min(Math.round(weight * 1.5), 22));
  }

  for (const term of profile.searchTerms.slice(0, 4)) {
    if (term.length >= 2) {
      parts.push('CASE WHEN lower(l.title) LIKE ? THEN 12 ELSE 0 END');
      params.push(`%${term}%`);
    }
  }

  if (profile.viewedListingIds.length > 0) {
    const ids = profile.viewedListingIds.slice(0, 60);
    const placeholders = ids.map(() => '?').join(', ');
    parts.push(`CASE WHEN l.id IN (${placeholders}) THEN -18 ELSE 4 END`);
    params.push(...ids);
  } else {
    parts.push('4');
  }

  return { sql: parts.join(' + '), params };
}

/** Холодний старт для нових користувачів без сигналів інтересів. */
export function buildColdStartOrderBoost(): PersonalizationOrderBoost {
  const recent7 = isPostgres()
    ? `COALESCE(l."publishedAt", l."createdAt") >= NOW() - INTERVAL '7 days'`
    : `datetime(COALESCE(l.publishedAt, l.createdAt)) >= datetime('now', '-7 days')`;
  const recent30 = isPostgres()
    ? `COALESCE(l."publishedAt", l."createdAt") >= NOW() - INTERVAL '30 days'`
    : `datetime(COALESCE(l.publishedAt, l.createdAt)) >= datetime('now', '-30 days')`;

  const diversitySql = isPostgres()
    ? `(ABS(hashtext(COALESCE(l.category, '') || CAST(l.id AS TEXT))) % 19)`
    : `(ABS(CAST(substr(hex(l.id), 1, 8) AS INTEGER)) % 19)`;

  const sql = [
    '0',
    `CASE WHEN ${recent7} THEN 14 WHEN ${recent30} THEN 7 ELSE 3 END`,
    `CASE WHEN l.images IS NOT NULL AND l.images != '[]' AND l.images != '' THEN 8 ELSE 0 END`,
    `CASE WHEN u.avatar IS NOT NULL AND u.avatar != '' AND u.avatar != '👤' THEN 5 ELSE 0 END`,
    `CASE WHEN u.username IS NOT NULL AND TRIM(u.username) != '' THEN 4 ELSE 0 END`,
    'CASE WHEN COALESCE(l.views, 0) >= 5 THEN LEAST(COALESCE(l.views, 0) / 8, 12) ELSE 0 END',
    diversitySql,
  ].join(' + ');

  return { sql, params: [] };
}

export function invalidatePersonalizationProfileCache(telegramId?: string): void {
  if (telegramId?.trim()) {
    profileCache.delete(telegramId.trim());
    return;
  }
  profileCache.clear();
}
