/**
 * SQLite FTS5 для пошуку оголошень (окремо від browse-фільтрів).
 */
import { prisma, executeWithRetry } from '@/lib/prisma';

let ftsReady = false;

function sanitizeFtsQuery(raw: string): string | null {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}\-+]/gu, ''))
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (!tokens.length) return null;
  // prefix match по кожному токену
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export async function ensureListingFts(): Promise<void> {
  if (ftsReady) return;
  try {
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`
        CREATE VIRTUAL TABLE IF NOT EXISTS listing_fts USING fts5(
          title,
          description,
          location,
          listing_id UNINDEXED,
          tokenize = 'unicode61'
        )
      `)
    );

    const cnt = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as c FROM listing_fts`
    )) as Array<{ c: number | bigint }>;
    const n = Number(cnt[0]?.c || 0);
    if (n === 0) {
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(`
          INSERT INTO listing_fts(listing_id, title, description, location)
          SELECT id, COALESCE(title,''), COALESCE(description,''), COALESCE(location,'')
          FROM Listing
          WHERE status = 'active'
        `)
      );
    }
    ftsReady = true;
  } catch (e: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[listingFts] ensure note:', e?.message);
    }
    // FTS може бути недоступний — feed впаде на LIKE fallback
    ftsReady = false;
  }
}

export async function upsertListingFts(item: {
  id: number;
  title: string;
  description: string;
  location: string;
}): Promise<void> {
  try {
    await ensureListingFts();
    if (!ftsReady) return;
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM listing_fts WHERE listing_id = ?`,
        item.id
      )
    );
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO listing_fts(listing_id, title, description, location) VALUES (?, ?, ?, ?)`,
        item.id,
        item.title || '',
        item.description || '',
        item.location || ''
      )
    );
  } catch {
    /* ignore */
  }
}

export async function deleteListingFts(listingId: number): Promise<void> {
  try {
    await ensureListingFts();
    if (!ftsReady) return;
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(`DELETE FROM listing_fts WHERE listing_id = ?`, listingId)
    );
  } catch {
    /* ignore */
  }
}

/**
 * Повертає id оголошень за FTS MATCH, або null якщо FTS недоступний / порожній запит.
 */
export async function searchListingIdsViaFts(
  search: string,
  limit = 400
): Promise<number[] | null> {
  const match = sanitizeFtsQuery(search);
  if (!match) return [];
  try {
    await ensureListingFts();
    if (!ftsReady) return null;
    const rows = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT listing_id as id FROM listing_fts WHERE listing_fts MATCH ? LIMIT ?`,
        match,
        limit
      )
    )) as Array<{ id: number }>;
    return rows.map((r) => Number(r.id)).filter((id) => id > 0);
  } catch {
    return null;
  }
}
