import { NextResponse } from 'next/server';
import { loadHomeActivityStats } from '@/lib/stats/loadHomeActivityStats';
import { displayOnlineSynced } from '@/lib/stats/homeActivityOnline';

export const revalidate = 300;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
};

// Публічна статистика для головної / базару (без аутентифікації)
export async function GET() {
  try {
    const now = new Date();
    const stats = await loadHomeActivityStats(now);
    const payload = {
      ...stats,
      online: displayOnlineSynced(now),
    };

    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('[home-activity]', error);
    return NextResponse.json(
      {
        online: displayOnlineSynced(),
        newListingsToday: 0,
        newListingsByCity: [],
        newListingsByCategory: [],
        windowKey: '',
        error: 'unavailable',
      },
      { status: 503 }
    );
  }
}
