import { prisma } from '@/lib/prisma';
import { listingCityKeyFromLocation } from '@/utils/cityNormalization';

/**
 * Черга дайджестів по місту (спільна з bot/utils/city_digest_notify.py, SQLite).
 */
export async function ensureCityDigestTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CityDigestQueue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listingId INTEGER NOT NULL,
      cityKey TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      processedAt TEXT
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_citydigestqueue_processed ON CityDigestQueue(processedAt)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_citydigestqueue_city ON CityDigestQueue(cityKey)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_citydigestqueue_listing ON CityDigestQueue(listingId)`
  );
}

/**
 * Додає listing у чергу дайджесту (ідемпотентно по listingId).
 */
export async function enqueueCityDigestListing(listingId: number): Promise<void> {
  await ensureCityDigestTables();
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(location, '') AS loc FROM Listing WHERE id = ?`,
    listingId
  )) as Array<{ loc: string }>;
  if (!rows?.length) return;
  const cityKey = listingCityKeyFromLocation(rows[0].loc || '');
  if (!cityKey) return;
  const createdAt = new Date().toISOString();
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO CityDigestQueue(listingId, cityKey, createdAt, processedAt)
     VALUES (?, ?, ?, NULL)`,
    listingId,
    cityKey,
    createdAt
  );
}
