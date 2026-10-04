import { describe, expect, it } from 'vitest';
import { adaptSql, sqlBooleanIsTrue, sqlLikeOp } from '@/lib/dbSql';

/**
 * PostgreSQL rejects SELECT DISTINCT when ORDER BY uses expressions
 * that are not in the select list (CASE WHEN name LIKE …, bp.followersCount vs COALESCE alias).
 * That 500 was swallowed by /api/search/business as 503 + empty list.
 */
describe('business search SQL (Postgres-safe)', () => {
  it('does not combine DISTINCT with extra ORDER BY expressions', () => {
    const like = sqlLikeOp();
    const sql = `
      SELECT
        bp.id,
        COALESCE(u.rating, 0) as rating,
        COALESCE(bp.followersCount, 0) as followersCount
      FROM BusinessProfile bp
      JOIN User u ON u.id = bp.userId
      WHERE ${sqlBooleanIsTrue('bp.isPublished')}
      ORDER BY
        CASE WHEN bp.businessName ${like} ? THEN 0 ELSE 1 END,
        rating DESC,
        followersCount DESC
      LIMIT ? OFFSET ?
    `;
    expect(sql).not.toMatch(/SELECT\s+DISTINCT/i);
    const adapted = adaptSql(sql);
    expect(adapted).not.toMatch(/SELECT\s+DISTINCT/i);
  });
});
