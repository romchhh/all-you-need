import { prisma, executeDDLSafely } from '@/lib/prisma';

let listingStatsColumnsReady = false;

/** Колонки Listing, потрібні для home-activity SQL (старі SQLite без повної міграції). */
export async function ensureListingStatsColumns(): Promise<void> {
  if (listingStatsColumnsReady) return;
  try {
    const tableInfo = (await prisma.$queryRawUnsafe(
      `PRAGMA table_info(Listing)`
    )) as Array<{ name: string }>;
    const names = new Set(tableInfo.map((c) => c.name));

    if (!names.has('publishedAt')) {
      await executeDDLSafely(`ALTER TABLE Listing ADD COLUMN publishedAt DATETIME`);
    }
    if (!names.has('moderatedAt')) {
      await executeDDLSafely(`ALTER TABLE Listing ADD COLUMN moderatedAt DATETIME`);
    }
    if (!names.has('moderatedBy')) {
      await executeDDLSafely(`ALTER TABLE Listing ADD COLUMN moderatedBy INTEGER`);
    }

    listingStatsColumnsReady = true;
  } catch {
    listingStatsColumnsReady = true;
  }
}
