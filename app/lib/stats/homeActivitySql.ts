/**
 * Момент «появи на платформі» для статистики нових оголошень:
 * найпізніший з publishedAt / moderatedAt / updatedAt / createdAt.
 */
export function listingStatsPublishedAtSql(tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
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
  const statsAt = listingStatsPublishedAtSql(tableAlias);
  return `
  ${tableAlias ? `${tableAlias}.` : ''}status = 'active'
  AND ${statsAt} IS NOT NULL
  AND ${statsAt} > datetime('1970-01-01 00:00:01')
  AND ${statsAt} >= datetime(?)
  AND ${statsAt} <= datetime(?)
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
