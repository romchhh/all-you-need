/**
 * Момент «появи на платформі» для статистики нових оголошень:
 * publishedAt (після модерації) → moderatedAt → createdAt.
 */
export const LISTING_STATS_PUBLISHED_AT_SQL = `
  datetime(
    replace(
      substr(
        COALESCE(
          NULLIF(TRIM(publishedAt), ''),
          NULLIF(TRIM(moderatedAt), ''),
          NULLIF(TRIM(createdAt), '')
        ),
        1,
        19
      ),
      'T',
      ' '
    )
  )
`;

/** Активні оголошення, опубліковані в поточному добовому вікні (з dayStart UTC). */
export const NEW_LISTINGS_IN_KYIV_WINDOW_SQL = `
  status = 'active'
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} IS NOT NULL
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} >= datetime(?)
  AND ${LISTING_STATS_PUBLISHED_AT_SQL} <= datetime('now')
`;
