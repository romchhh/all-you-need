import { NextRequest, NextResponse } from 'next/server';
import { invalidateHomeActivityCache } from '@/lib/stats/homeActivityCache';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.BOT_API_KEY || 'your-secret-key';
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  invalidateHomeActivityCache();
  return NextResponse.json({ ok: true });
}
