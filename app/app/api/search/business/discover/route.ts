import { NextRequest, NextResponse } from 'next/server';
import {
  formatBusinessActivityLine,
  formatBusinessLocationLine,
  getRecommendedBusinessProfiles,
} from '@/lib/business/businessSearchHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '6', 10), 12);
    const viewerTelegramId = sp.get('viewerTelegramId');
    const lang = (sp.get('lang') === 'ru' ? 'ru' : 'uk') as 'uk' | 'ru';

    const items = await getRecommendedBusinessProfiles(limit, viewerTelegramId);

    return NextResponse.json({
      recommendedBusinesses: items.map((item) => ({
        ...item,
        activityLine: formatBusinessActivityLine(item.category, item.subcategory, lang),
        locationLine: formatBusinessLocationLine(item.city, item.address),
      })),
    });
  } catch (error) {
    console.error('[search/business/discover GET]', error);
    return NextResponse.json({ recommendedBusinesses: [], error: 'unavailable' }, { status: 503 });
  }
}
