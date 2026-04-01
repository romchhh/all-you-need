import { formatPostedTimeUk } from './formatPostedTimeUk';

/**
 * Дати в SQLite зберігаються як UTC без суфікса (toSQLiteDate → "YYYY-MM-DD HH:mm:ss").
 * `new Date("2026-04-01 12:00:00")` у браузері трактується як локальний час → зсув на години.
 * Ця функція інтерпретує такий рядок як UTC.
 */
export function parseDbDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (s.includes('T')) {
    const hasZone =
      s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s);
    const d = new Date(hasZone ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Момент для «опубліковано / скільки тому»: спочатку publishedAt, інакше createdAt. */
export function getListingDisplayDate(listing: {
  publishedAt?: string | null;
  createdAt?: string | null | Date;
}): Date | null {
  if (listing.publishedAt) {
    const p = parseDbDate(listing.publishedAt);
    if (p) return p;
  }
  return parseDbDate(listing.createdAt ?? null);
}

/** Поля часу для JSON API каталогу / картки оголошення. */
export function listingTimeFieldsForApi(listing: {
  publishedAt?: string | null;
  createdAt?: string | null | Date;
}) {
  const display = getListingDisplayDate(listing);
  const publishedRaw = listing.publishedAt;
  const createdRaw = listing.createdAt;
  const createdIso =
    parseDbDate(createdRaw)?.toISOString() ??
    (createdRaw instanceof Date ? createdRaw.toISOString() : (createdRaw as string | null | undefined));
  return {
    posted: display ? formatPostedTimeUk(display) : '',
    publishedAt:
      publishedRaw != null && String(publishedRaw).trim() !== ''
        ? parseDbDate(publishedRaw)?.toISOString() ?? String(publishedRaw)
        : null,
    createdAt: createdIso,
  };
}
