import { NextRequest, NextResponse } from 'next/server';
import { loadSearchDiscoverShell } from '@/lib/search/loadDiscoverShell';

export const dynamic = 'force-dynamic';

/** Один round-trip для головного екрану пошуку (популярне + бізнеси). */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const telegramId = sp.get('telegramId');
    const viewerTelegramId = sp.get('viewerTelegramId') ?? telegramId;
    const lang = sp.get('lang') === 'ru' ? 'ru' : 'uk';

    const payload = await loadSearchDiscoverShell({
      telegramId,
      viewerTelegramId,
      popularLimit: parseInt(sp.get('popularLimit') || '24', 10),
      recentLimit: parseInt(sp.get('recentLimit') || '16', 10),
      businessLimit: parseInt(sp.get('businessLimit') || '12', 10),
      lang,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[search/shell]', error);
    return NextResponse.json(
      {
        popularListings: [],
        recentViewedListings: [],
        recommendedBusinesses: [],
        error: 'unavailable',
      },
      { status: 503 }
    );
  }
}
