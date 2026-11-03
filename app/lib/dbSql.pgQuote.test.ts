import { afterEach, describe, expect, it, vi } from 'vitest';

describe('adaptSql SearchSubscription', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it('quotes queryKey/queryText/entityMode for postgres', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    vi.resetModules();
    const { adaptSql } = await import('@/lib/dbSql');
    const sql = adaptSql(
      `INSERT INTO SearchSubscription (userId, queryKey, queryText, entityMode, createdAt)
       VALUES (?, ?, ?, ?, NOW())
       ON CONFLICT (userId, queryKey, entityMode) DO NOTHING`
    );
    expect(sql).toContain('"SearchSubscription"');
    expect(sql).toContain('"userId"');
    expect(sql).toContain('"queryKey"');
    expect(sql).toContain('"queryText"');
    expect(sql).toContain('"entityMode"');
    expect(sql).toMatch(/ON CONFLICT\s*\("userId",\s*"queryKey",\s*"entityMode"\)/);
  });

  it('quotes CityDigestQueue ON CONFLICT (listingId)', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    vi.resetModules();
    const { adaptSql } = await import('@/lib/dbSql');
    const sql = adaptSql(
      `INSERT INTO CityDigestQueue(listingId, cityKey, createdAt, processedAt)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT (listingId) DO NOTHING`
    );
    expect(sql).toContain('"CityDigestQueue"');
    expect(sql).toContain('"listingId"');
    expect(sql).toContain('"cityKey"');
    expect(sql).toMatch(/ON CONFLICT\s*\("listingId"\)/);
  });

  it('quotes CitySubscription ON CONFLICT (userId, cityKey)', async () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    vi.resetModules();
    const { adaptSql } = await import('@/lib/dbSql');
    const sql = adaptSql(
      `INSERT INTO CitySubscription (userId, cityKey, createdAt) VALUES (?, ?, NOW())
       ON CONFLICT (userId, cityKey) DO NOTHING`
    );
    expect(sql).toContain('"CitySubscription"');
    expect(sql).toMatch(/ON CONFLICT\s*\("userId",\s*"cityKey"\)/);
  });
});
