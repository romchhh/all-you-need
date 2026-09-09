import { isPostgres } from '@/lib/dbSql';

/**
 * Момент «появи на платформі» для статистики нових оголошень:
 * найпізніший з publishedAt / moderatedAt / updatedAt / createdAt.
 */
export function listingStatsPublishedAtSql(tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  if (isPostgres()) {
    return `
    GREATEST(
      COALESCE(NULLIF(TRIM(${p}"publishedAt"::text), ''), '1970-01-01')::timestamp,
      COALESCE(NULLIF(TRIM(${p}"moderatedAt"::text), ''), '1970-01-01')::timestamp,
      COALESCE(NULLIF(TRIM(${p}"updatedAt"::text), ''), '1970-01-01')::timestamp,
      COALESCE(NULLIF(TRIM(${p}"createdAt"::text), ''), '1970-01-01')::timestamp
    )
  `;
  }
  return `
  datetime(
    MAX(
      datetime(replace(substr(COALESCE(NULLIF(TRIM(${p}publishedAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' ')),
      datetime(replace(substr(COALESCE(NULLIF(TRIM(${p}moderatedAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' ')),
      datetime(replace(substr(COALESCE(NULLIF(TRIM(${p}updatedAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' ')),
      datetime(replace(substr(COALESCE(NULLIF(TRIM(${p}createdAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' '))
    )
  )
`;
}

/** @deprecated use listingStatsPublishedAtSql() */
export const LISTING_STATS_PUBLISHED_AT_SQL = listingStatsPublishedAtSql();

export function newListingsInKyivWindowSql(tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  // Лічильник «нових сьогодні» — за createdAt (не updatedAt), щоб міграція БД не
  // занижувала/завищувала статистику через масове оновлення updatedAt.
  if (isPostgres()) {
    return `
  ${p}status = 'active'
  AND ${p}"createdAt" IS NOT NULL
  AND ${p}"createdAt" >= ?::timestamp
  AND ${p}"createdAt" <= ?::timestamp
`;
  }
  return `
  ${p}status = 'active'
  AND ${p}createdAt IS NOT NULL
  AND datetime(${p}createdAt) >= datetime(?)
  AND datetime(${p}createdAt) <= datetime(?)
`;
}

/** @deprecated use newListingsInKyivWindowSql() */
export const NEW_LISTINGS_IN_KYIV_WINDOW_SQL = newListingsInKyivWindowSql();

/** Місто для групування: location → parsed_items.source_city → Germany. */
export const LISTING_EFFECTIVE_CITY_SQL = `
  COALESCE(
    NULLIF(TRIM(l.location), ''),
    NULLIF(TRIM(pi.source_city), ''),
    'Germany'
  )
`;
