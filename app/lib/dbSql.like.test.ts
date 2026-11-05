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
  it('does not use postgres regexp_replace', async () => {
    const { sqlListingSearchableDescription } = await import('@/lib/listings/searchVariants');
    const sql = sqlListingSearchableDescription('l');
    expect(sql).toBe("COALESCE(l.description, '')");
    expect(sql).not.toMatch(/regexp_replace/i);
  });
});
