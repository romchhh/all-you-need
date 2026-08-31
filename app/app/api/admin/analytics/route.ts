import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { getAnalyticsSummary } from '@/lib/analytics/analyticsStore';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const days = Number(request.nextUrl.searchParams.get('days') || '30');
    const summary = await getAnalyticsSummary(Number.isFinite(days) ? days : 30);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
