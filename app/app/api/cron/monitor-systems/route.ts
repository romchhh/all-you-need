import { NextRequest, NextResponse } from 'next/server';
import {
  processMonitorAlerts,
  runSystemHealthChecks,
} from '@/lib/monitoring/systemMonitor';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const checks = await runSystemHealthChecks();
    await processMonitorAlerts(checks);

    const problems = checks.filter((check) => check.status !== 'ok');

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      total: checks.length,
      problems: problems.length,
      checks,
    });
  } catch (error) {
    console.error('Monitor systems cron error:', error);
    return NextResponse.json({ error: 'Monitoring cron failed' }, { status: 500 });
  }
}
