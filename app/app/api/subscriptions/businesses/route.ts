import { NextRequest, NextResponse } from 'next/server';
import {
  formatBusinessActivityLine,
  formatBusinessLocationLine,
  listFollowedBusinessProfiles,
} from '@/lib/business/businessSearchHelpers';
import { logApiError } from '@/lib/server/logApiError';
import { trackUserActivity } from '@/utils/trackActivity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await trackUserActivity(request);

    const sp = request.nextUrl.searchParams;
    const telegramId = sp.get('telegramId')?.trim();
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const limit = Math.min(parseInt(sp.get('limit') || '50', 10) || 50, 100);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
    const lang = (sp.get('lang') === 'ru' ? 'ru' : 'uk') as 'uk' | 'ru';

    const { items, total } = await listFollowedBusinessProfiles(telegramId, { limit, offset });

    const businesses = items.map((item) => ({
      ...item,
      activityLine: formatBusinessActivityLine(item.category, item.subcategory, lang),
      locationLine: formatBusinessLocationLine(item.city, item.address),
      isFollowing: true,
    }));

    return NextResponse.json({ total, businesses });
  } catch (error) {
    logApiError('subscriptions/businesses GET', error);
    return NextResponse.json({ total: 0, businesses: [], error: 'unavailable' }, { status: 503 });
  }
}
