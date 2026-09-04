import { prisma } from '@/lib/prisma';

let listingStatsColumnsReady = false;

/** Колонки Listing, потрібні для home-activity SQL (старі SQLite без повної міграції). */
export async function ensureListingStatsColumns(): Promise<void> {
  if (listingStatsColumnsReady) return;
  try {
    const tableInfo = (await prisma.$queryRawUnsafe(
      `PRAGMA table_info(Listing)`
    )) as Array<{ name: string }>;
    const names = new Set(tableInfo.map((c) => c.name));

    const addColumn = async (col: string, ddl: string) => {
      if (names.has(col)) return;
      try {
        await prisma.$executeRawUnsafe(ddl);
        names.add(col);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (
          msg.includes('duplicate column name') ||
          msg.includes('duplicate column') ||
          msg.includes('already exists') ||
          msg.includes('Execute returned results')
        ) {
          names.add(col);
        } else if (process.env.NODE_ENV === 'development') {
          console.log(`Note: Could not add Listing.${col}:`, msg);
        }
      }
    };

    await addColumn('publishedAt', 'ALTER TABLE Listing ADD COLUMN publishedAt DATETIME');
    await addColumn('moderatedAt', 'ALTER TABLE Listing ADD COLUMN moderatedAt DATETIME');
    await addColumn('moderatedBy', 'ALTER TABLE Listing ADD COLUMN moderatedBy INTEGER');

    listingStatsColumnsReady = true;
  } catch {
    listingStatsColumnsReady = true;
  }
}
