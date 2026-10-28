import { isPostgres } from '@/lib/dbSql';

/**
 * Момент «появи на платформі» для статистики нових оголошень.
 * Лише перша публікація / модерація / створення — БЕЗ updatedAt
 * (інакше будь-яке оновлення ціни/переглядів рахується як «нове сьогодні»).
 */
export function listingStatsPublishedAtSql(tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  if (isPostgres()) {
    return `
    COALESCE(
      NULLIF(TRIM(${p}"publishedAt"::text), '')::timestamp,
      NULLIF(TRIM(${p}"moderatedAt"::text), '')::timestamp,
      NULLIF(TRIM(${p}"createdAt"::text), '')::timestamp
    )
  `;
  }
  // SQLite: нормалізуємо ISO «T» → пробіл для datetime()
  return `
  datetime(
    replace(
      substr(
        COALESCE(
          NULLIF(TRIM(${p}publishedAt), ''),
          NULLIF(TRIM(${p}moderatedAt), ''),
          NULLIF(TRIM(${p}createdAt), ''),
          '1970-01-01 00:00:00'
        ),
        1,
        19
      ),
      'T',
      ' '
    )
  )
`;
}

/** @deprecated use listingStatsPublishedAtSql() */
export const LISTING_STATS_PUBLISHED_AT_SQL = listingStatsPublishedAtSql();

export function newListingsInKyivWindowSql(tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  const publishedAt = listingStatsPublishedAtSql(tableAlias);
  if (isPostgres()) {
    return `
  ${p}status = 'active'
  AND (${publishedAt}) >= ?::timestamp
  AND (${publishedAt}) <= ?::timestamp
`;
  }
  return `
  ${p}status = 'active'
  AND datetime((${publishedAt})) >= datetime(?)
  AND datetime((${publishedAt})) <= datetime(?)
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
