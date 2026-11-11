import { NextRequest, NextResponse } from 'next/server';
import { notifySearchSubscribersForListingId } from '@/lib/search/searchSubscriptionNotifications';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.BOT_API_KEY || 'your-secret-key';
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let listingId: number | null = null;
  try {
    const body = await request.json();
    const raw = body?.listingId ?? body?.listing_id;
    listingId = raw != null ? parseInt(String(raw), 10) : NaN;
  } catch {
    listingId = NaN;
  }

  if (!listingId || !Number.isFinite(listingId)) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  try {
    const result = await notifySearchSubscribersForListingId(listingId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/notify-search-subscribers]', error);
    return NextResponse.json({ error: 'notify_failed' }, { status: 500 });
  }
}
