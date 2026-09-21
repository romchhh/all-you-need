import { NextRequest, NextResponse } from 'next/server';
import {
  formatBusinessActivityLine,
  formatBusinessLocationLine,
  searchBusinessProfiles,
  type BusinessSearchSort,
} from '@/lib/business/businessSearchHelpers';

export const dynamic = 'force-dynamic';

function parseBool(value: string | null): boolean {
  return value === '1' || value === 'true';
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const search = sp.get('search')?.trim() || '';
    const sphere = sp.get('sphere');
    const direction = sp.get('direction');
    const cities = sp.get('cities')?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
    const sortRaw = sp.get('sortBy')?.trim();
    const sortBy: BusinessSearchSort = sortRaw === 'rating' ? 'rating' : 'relevance';
    const limit = Math.min(parseInt(sp.get('limit') || '24', 10), 48);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10), 0);
    const viewerTelegramId = sp.get('viewerTelegramId');

    const minRatingRaw = sp.get('minRating');
    const minRating =
      minRatingRaw === '4.5' ? 4.5 : minRatingRaw === '4' || minRatingRaw === '4.0' ? 4 : null;

    const lang = (sp.get('lang') === 'ru' ? 'ru' : 'uk') as 'uk' | 'ru';

    const { items, total } = await searchBusinessProfiles({
      search: search || undefined,
      sphere,
      direction,
      cities,
      hasPhysicalAddress: parseBool(sp.get('hasPhysicalAddress')),
      travelsToClient: parseBool(sp.get('travelsToClient')),
      worksOnline: parseBool(sp.get('worksOnline')),
      minRating,
      sortBy,
      limit,
      offset,
      viewerTelegramId,
    });

    return NextResponse.json({
      total,
      businesses: items.map((item) => ({
        ...item,
        activityLine: formatBusinessActivityLine(item.category, item.subcategory, lang),
        locationLine: formatBusinessLocationLine(item.city, item.address),
      })),
    });
  } catch (error) {
    console.error('[search/business GET]', error);
    return NextResponse.json({ total: 0, businesses: [], error: 'unavailable' }, { status: 503 });
  }
}
