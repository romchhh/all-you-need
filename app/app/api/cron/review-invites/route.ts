import { NextRequest, NextResponse } from 'next/server';
import { processDueBusinessReviewInvites } from '@/lib/reviews/reviewInvite';
import { logApiError } from '@/lib/server/logApiError';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processDueBusinessReviewInvites(50);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logApiError('cron/review-invites', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
