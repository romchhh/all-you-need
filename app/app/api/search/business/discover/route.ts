import { NextRequest, NextResponse } from 'next/server';
import {
  formatBusinessActivityLine,
  formatBusinessLocationLine,
  getRecommendedBusinessProfiles,
} from '@/lib/business/businessSearchHelpers';
import { attachBusinessSearchListingPreviews } from '@/lib/business/businessSearchListings';

import { logApiError } from '@/lib/server/logApiError';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '6', 10), 12);
    const viewerTelegramId = sp.get('viewerTelegramId');
    const lang = (sp.get('lang') === 'ru' ? 'ru' : 'uk') as 'uk' | 'ru';

    const items = await getRecommendedBusinessProfiles(limit, viewerTelegramId);
    const mapped = items.map((item) => ({
      ...item,
      activityLine: formatBusinessActivityLine(item.category, item.subcategory, lang),
      locationLine: formatBusinessLocationLine(item.city, item.address),
    }));

    let recommendedBusinesses = mapped;
    try {
      recommendedBusinesses = await attachBusinessSearchListingPreviews(mapped);
    } catch (previewError) {
      logApiError('search/business/discover previews', previewError);
      recommendedBusinesses = mapped.map((b) => ({ ...b, vitrineListings: [] }));
    }

    return NextResponse.json({ recommendedBusinesses });
  } catch (error) {
    logApiError('search/business/discover GET', error);
    return NextResponse.json({ recommendedBusinesses: [], error: 'unavailable' }, { status: 503 });
  }
}
