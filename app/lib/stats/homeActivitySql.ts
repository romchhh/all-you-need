/**
 * Момент «появи на платформі» для статистики нових оголошень:
 * найпізніший з publishedAt / moderatedAt / updatedAt / createdAt.
 */
export const LISTING_STATS_PUBLISHED_AT_SQL = `
  datetime(
    MAX(
      datetime(replace(substr(COALESCE(NULLIF(TRIM(publishedAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' ')),
      datetime(replace(substr(COALESCE(NULLIF(TRIM(moderatedAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' ')),
      datetime(replace(substr(COALESCE(NULLIF(TRIM(updatedAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' ')),
      datetime(replace(substr(COALESCE(NULLIF(TRIM(createdAt), ''), '1970-01-01 00:00:00'), 1, 19), 'T', ' '))
    )
  )
`;

/** Активні оголошення, опубліковані в поточному добовому вікні (з dayStart UTC). */
export const NEW_LISTINGS_IN_KYIV_WINDOW_SQL = `
  status = 'active'
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} IS NOT NULL
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} > datetime('1970-01-01 00:00:01')
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} >= datetime(?)
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} <= datetime(?)
`;
