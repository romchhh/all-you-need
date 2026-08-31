import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import {
  getAnalyticsTrackingConfig,
  getSystemTestResults,
  saveAnalyticsTrackingConfig,
  saveSystemTestResults,
} from '@/lib/testing/analyticsConfig';
import { runConfiguredSystemTests } from '@/lib/monitoring/systemMonitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [config, lastTests] = await Promise.all([
      getAnalyticsTrackingConfig(),
      getSystemTestResults(),
    ]);

    return NextResponse.json({ config, lastTests });
  } catch (error) {
    console.error('Admin testing GET error:', error);
    return NextResponse.json({ error: 'Failed to load testing config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as string;

    if (action === 'save_config') {
      await saveAnalyticsTrackingConfig(body.config);
      return NextResponse.json({ ok: true });
    }

    if (action === 'run_tests') {
      const results = await runConfiguredSystemTests();
      await saveSystemTestResults(results);
      return NextResponse.json({ ok: true, results, ranAt: new Date().toISOString() });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin testing POST error:', error);
    return NextResponse.json({ error: 'Failed to update testing config' }, { status: 500 });
  }
}
