import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import {
  getMonitoringConfig,
  getRecentMonitorLogs,
  processMonitorAlerts,
  runSystemHealthChecks,
  saveMonitoringConfig,
} from '@/lib/monitoring/systemMonitor';
import { parseAdministratorIds } from '@/lib/telegram/adminAlerts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [config, logs, checks] = await Promise.all([
      getMonitoringConfig(),
      getRecentMonitorLogs(80),
      runSystemHealthChecks(),
    ]);

    return NextResponse.json({
      config,
      checks,
      logs,
      administratorsConfigured: parseAdministratorIds().length,
    });
  } catch (error) {
    console.error('Admin monitoring GET error:', error);
    return NextResponse.json({ error: 'Failed to load monitoring' }, { status: 500 });
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
      await saveMonitoringConfig(body.config);
      return NextResponse.json({ ok: true });
    }

    if (action === 'run_checks') {
      const checks = await runSystemHealthChecks();
      await processMonitorAlerts(checks);
      const logs = await getRecentMonitorLogs(80);
      return NextResponse.json({ ok: true, checks, logs });
    }

    if (action === 'test_alert') {
      const { notifyAdminsAboutIssue } = await import('@/lib/telegram/adminAlerts');
      const result = await notifyAdminsAboutIssue(
        'Тестове сповіщення',
        'Це тест моніторингу TradeGround з адмін-панелі.',
        { severity: 'warning' }
      );
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin monitoring POST error:', error);
    return NextResponse.json({ error: 'Failed to update monitoring' }, { status: 500 });
  }
}
