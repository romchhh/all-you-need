/**
 * Denormalized поля для швидкого /api/listings/feed.
 * favoritesCount = COUNT(Favorite); на картці: favoritesCount + favoriteBoost.
 * thumbUrl = перший optimized або original path.
 */
import { prisma, executeWithRetry } from '@/lib/prisma';

let denormReady = false;
let backfillDone = false;

export async function ensureFeedDenormColumns(): Promise<void> {
  if (denormReady) return;
  const tableInfo = (await prisma.$queryRawUnsafe(
    `PRAGMA table_info(Listing)`
  )) as Array<{ name: string }>;
  const names = new Set(tableInfo.map((c) => c.name));

  const add = async (col: string, ddl: string) => {
    if (names.has(col)) return;
    try {
      await prisma.$executeRawUnsafe(ddl);
      names.add(col);
    } catch (e: any) {
      if (
        String(e?.message || '').includes('duplicate column') ||
        String(e?.message || '').includes('already exists')
      ) {
        names.add(col);
      }
    }
  };

  await add(
    'favoritesCount',
    'ALTER TABLE Listing ADD COLUMN favoritesCount INTEGER NOT NULL DEFAULT 0'
  );
  await add('thumbUrl', 'ALTER TABLE Listing ADD COLUMN thumbUrl TEXT');

  denormReady = true;
}

/** Одноразовий backfill favoritesCount + thumbUrl (ліниво при старті feed). */
export async function backfillFeedDenormIfNeeded(): Promise<void> {
  if (backfillDone) return;
  await ensureFeedDenormColumns();
  try {
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        UPDATE Listing
        SET favoritesCount = COALESCE((
          SELECT COUNT(*) FROM Favorite f WHERE f.listingId = Listing.id
        ), 0)
      `)
    );

    // thumbUrl: лише порожні — з JSON images/optimizedImages у JS пачками
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, images, optimizedImages FROM Listing
       WHERE thumbUrl IS NULL OR thumbUrl = ''
       LIMIT 500`
    )) as Array<{ id: number; images: string; optimizedImages: string | null }>;

    for (const row of rows) {
      const thumb = pickThumbFromJson(row.optimizedImages, row.images);
      if (!thumb) continue;
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET thumbUrl = ? WHERE id = ?`,
        thumb,
        row.id
      );
    }
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[feedDenorm] backfill note:', (e as Error)?.message);
    }
  }
  backfillDone = true;
}

export function pickThumbFromJson(
  optimizedImages: string | null | undefined,
  images: string | null | undefined
): string {
  const parse = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    try {
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
    } catch {
      return [];
    }
  };
  const opt = parse(optimizedImages);
  if (opt[0]) return opt[0];
  const orig = parse(images);
  return orig[0] || '';
}

export async function setListingThumbUrl(
  listingId: number,
  thumbUrl: string | null
): Promise<void> {
  if (!thumbUrl) return;
  await ensureFeedDenormColumns();
  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `UPDATE Listing SET thumbUrl = ? WHERE id = ?`,
      thumbUrl,
      listingId
    )
  );
}

export async function bumpListingFavoritesCount(
  listingId: number,
  delta: 1 | -1
): Promise<void> {
  await ensureFeedDenormColumns();
  if (delta > 0) {
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `UPDATE Listing SET favoritesCount = COALESCE(favoritesCount, 0) + 1 WHERE id = ?`,
        listingId
      )
    );
  } else {
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `UPDATE Listing
         SET favoritesCount = CASE
           WHEN COALESCE(favoritesCount, 0) > 0 THEN favoritesCount - 1
           ELSE 0
         END
         WHERE id = ?`,
        listingId
      )
    );
  }
}

/** Відображуваний лічильник без JOIN. */
export const FEED_FAVORITES_DISPLAY_SQL =
  `(COALESCE(l.favoritesCount, 0) + COALESCE(l.favoriteBoost, 0))`;
