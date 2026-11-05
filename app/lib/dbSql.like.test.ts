import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('sqlLikeOp', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it('uses ILIKE on postgres', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    vi.resetModules();
    const { sqlLikeOp } = await import('@/lib/dbSql');
    expect(sqlLikeOp()).toBe('ILIKE');
  });

  it('uses LIKE on sqlite', async () => {
    process.env.DATABASE_URL = 'file:./dev.db';
    vi.resetModules();
    const { sqlLikeOp } = await import('@/lib/dbSql');
    expect(sqlLikeOp()).toBe('LIKE');
  });
});

describe('sqlListingSearchableDescription', () => {
  it('cuts parser author lines without regexp_replace on postgres', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    vi.resetModules();
    const { sqlListingSearchableDescription } = await import('@/lib/listings/searchVariants');
    const { adaptSql } = await import('@/lib/dbSql');
    const sql = sqlListingSearchableDescription('l');
    expect(sql).toMatch(/strpos/i);
    expect(sql).not.toMatch(/regexp_replace/i);
    const adapted = adaptSql(sql);
    expect(adapted).not.toMatch(/regexp_replace/i);
    expect(adapted).not.toMatch(/datetime\(/i);
  });
});

describe('search subscription SQL', () => {
  it('quotes SearchSubscription and keeps INSERT SELECT placeholders', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    vi.resetModules();
    const { adaptSql, toPgParams } = await import('@/lib/dbSql');
    const alter = adaptSql(
      `ALTER TABLE SearchSubscription ADD COLUMN entityMode TEXT NOT NULL DEFAULT 'listings'`
    );
    expect(alter).toContain('ALTER TABLE "SearchSubscription"');
    expect(alter).toContain('"entityMode"');

    const insert = `INSERT INTO SearchSubscription (userId, queryKey, queryText, entityMode, createdAt)
      SELECT ?, ?, ?, ?, NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM SearchSubscription
        WHERE userId = ? AND queryKey = ? AND entityMode = ?
      )`;
    const { sql, params } = toPgParams(insert, [1, 'a', 'a', 'listings', 1, 'a', 'listings']);
    expect(sql).toContain('INSERT INTO "SearchSubscription"');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql.match(/\$\d+/g)).toHaveLength(7);
    expect(params).toHaveLength(7);
    expect(adaptSql(`datetime(l.promotionEnds) > datetime('now')`)).toBe(
      'l."promotionEnds" > NOW()'
    );
  });
});
