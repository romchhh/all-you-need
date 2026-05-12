import { NextResponse } from 'next/server';
import { prisma, executeWithRetry, ensureUserSessionTable } from '@/lib/prisma';

const KYIV_TZ = 'Europe/Kyiv';

/** YYYY-MM-DD у календарі Europe/Kyiv для моменту ref. */
function kyivYmd(ref: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
}

/** UTC-момент початку доби 00:00 у Europe/Kyiv для того ж «київського дня», що й ref. */
function startOfKyivDay(ref: Date): Date {
  const ymd = kyivYmd(ref);
  const from = ref.getTime() - 30 * 3600000;
  const to = ref.getTime() + 3600000;
  for (let t = from; t <= to; t += 60 * 1000) {
    const d = new Date(t);
    if (kyivYmd(d) !== ymd) continue;
    const h = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, hour: '2-digit', hour12: false }).format(d),
      10
    );
    const mi = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_TZ, minute: '2-digit' }).format(d),
      10
    );
    if (h === 0 && mi === 0) return d;
  }
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  return d;
}

const ONLINE_DISPLAY_CAP = 50;

// Публічна статистика для головної / базару (без аутентифікації)
export async function GET() {
  try {
    const now = new Date();
    const dayStart = startOfKyivDay(now);
    const dayStartIso = dayStart.toISOString();

    const newListingsTodayResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM Listing WHERE createdAt >= ?`,
        dayStartIso
      ) as Promise<Array<{ count: bigint }>>
    );
    const newListingsToday = Number(newListingsTodayResult[0]?.count || 0);

    await ensureUserSessionTable();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourAgoStr = oneHourAgo.toISOString().replace('T', ' ').substring(0, 19);
    const onlineUsersResult = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT userId) as count FROM UserSession WHERE datetime(lastActiveAt) >= datetime(?)`,
        oneHourAgoStr
      ) as Promise<Array<{ count: bigint }>>
    ).catch(() => [{ count: BigInt(0) }]);
    const rawOnline = Number(onlineUsersResult[0]?.count || 0);
    const online = Math.min(rawOnline, ONLINE_DISPLAY_CAP);

    return NextResponse.json({
      online,
      newListingsToday,
    });
  } catch (error) {
    console.error('[home-activity]', error);
    return NextResponse.json(
      { online: 0, newListingsToday: 0, error: 'unavailable' },
      { status: 503 }
    );
  }
}
