import { prisma, executeWithRetry } from '@/lib/prisma';
import { getSystemSetting, setSystemSetting } from '@/utils/dbHelpers';
import {
  DEFAULT_MONITORING_CONFIG,
  notifyAdminsAboutIssue,
  type MonitorCheckResult,
  type MonitorStatus,
  type MonitoringConfig,
} from '@/lib/telegram/adminAlerts';

export type { MonitorCheckResult, MonitorStatus, MonitoringConfig };
export { DEFAULT_MONITORING_CONFIG, notifyAdminsAboutIssue };

const MONITORING_CONFIG_KEY = 'systemMonitoringConfig';
const LAST_ALERTS_KEY = 'systemMonitoringLastAlerts';

let monitorLogTableReady = false;

export async function ensureSystemMonitorLogTable(): Promise<void> {
  if (monitorLogTableReady) return;

  try {
    const tableInfo = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='SystemMonitorLog'`
      )
    )) as Array<{ name: string }>;

    if (tableInfo.length === 0) {
      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS SystemMonitorLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serviceName TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            latencyMs INTEGER,
            details TEXT,
            checkedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `)
      );

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS idx_monitor_checked_at ON SystemMonitorLog(checkedAt)`
        )
      ).catch(() => {});

      await executeWithRetry(() =>
        prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS idx_monitor_service ON SystemMonitorLog(serviceName)`
        )
      ).catch(() => {});
    }

    monitorLogTableReady = true;
  } catch {
    monitorLogTableReady = true;
  }
}

export async function getMonitoringConfig(): Promise<MonitoringConfig> {
  return getSystemSetting<MonitoringConfig>(MONITORING_CONFIG_KEY, DEFAULT_MONITORING_CONFIG);
}

export async function saveMonitoringConfig(config: MonitoringConfig): Promise<void> {
  await setSystemSetting(
    MONITORING_CONFIG_KEY,
    config,
    'System monitoring and admin alert settings'
  );
}

async function logMonitorResult(result: MonitorCheckResult): Promise<void> {
  await ensureSystemMonitorLogTable();

  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `INSERT INTO SystemMonitorLog (serviceName, status, message, latencyMs, details, checkedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      result.service,
      result.status,
      result.message,
      result.latencyMs ?? null,
      result.details ? JSON.stringify(result.details) : null
    )
  );
}

async function timedCheck(
  service: string,
  fn: () => Promise<{ message: string; details?: Record<string, unknown> }>
): Promise<MonitorCheckResult> {
  const started = Date.now();
  try {
    const outcome = await fn();
    return {
      service,
      status: 'ok',
      message: outcome.message,
      latencyMs: Date.now() - started,
      details: outcome.details,
    };
  } catch (error) {
    return {
      service,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - started,
    };
  }
}

export async function runSystemHealthChecks(): Promise<MonitorCheckResult[]> {
  const checks: MonitorCheckResult[] = [];

  checks.push(
    await timedCheck('app', async () => ({
      message: 'Next.js app is responding',
    }))
  );

  checks.push(
    await timedCheck('database', async () => {
      const rows = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM User`)
      )) as Array<{ count: number }>;
      return {
        message: `Database OK (${Number(rows[0]?.count ?? 0)} users)`,
      };
    })
  );

  checks.push(
    await timedCheck('listings_feed', async () => {
      const rows = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT COUNT(*) as count FROM Listing WHERE status IN ('active', 'approved')`
        )
      )) as Array<{ count: number }>;
      const count = Number(rows[0]?.count ?? 0);
      return {
        message: `${count} active listings`,
        details: { activeListings: count },
      };
    })
  );

  checks.push(
    await timedCheck('moderation_queue', async () => {
      const rows = (await executeWithRetry(() =>
        prisma.$queryRawUnsafe(
          `SELECT COUNT(*) as count FROM Listing WHERE moderationStatus = 'pending' OR status = 'pending_moderation'`
        )
      )) as Array<{ count: number }>;
      const count = Number(rows[0]?.count ?? 0);
      return {
        message: `${count} listings awaiting moderation`,
        details: { pendingModeration: count, elevated: count > 200 },
      };
    }).then((result) => {
      const pending = Number(result.details?.pendingModeration ?? 0);
      if (pending > 200) {
        return { ...result, status: 'warning' as MonitorStatus };
      }
      return result;
    })
  );

  checks.push(
    await timedCheck('parser_queue', async () => {
      try {
        const rows = (await executeWithRetry(() =>
          prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as count FROM parsed_items
             WHERE status = 'pending'
               AND marketplace_listing_id IS NULL
               AND IFNULL(auto_approved, 0) = 0`
          )
        )) as Array<{ count: number }>;
        const count = Number(rows[0]?.count ?? 0);
        return {
          message: `${count} parser items in manual queue`,
          details: { parserPending: count },
        };
      } catch {
        return {
          message: 'Parser table not available',
          details: { parserPending: null },
        };
      }
    })
  );

  checks.push(
    await timedCheck('telegram_bot', async () => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set');
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.description || 'Telegram getMe failed');
      }

      return {
        message: `Bot @${data.result?.username || 'unknown'} is online`,
        details: { botId: data.result?.id },
      };
    })
  );

  for (const check of checks) {
    await logMonitorResult(check);
  }

  return checks;
}

type LastAlertsMap = Record<string, string>;

async function shouldSendAlert(service: string, cooldownMinutes: number): Promise<boolean> {
  const lastAlerts = await getSystemSetting<LastAlertsMap>(LAST_ALERTS_KEY, {});
  const lastAt = lastAlerts[service];
  if (!lastAt) return true;

  const elapsedMs = Date.now() - new Date(lastAt).getTime();
  return elapsedMs >= cooldownMinutes * 60_000;
}

async function markAlertSent(service: string): Promise<void> {
  const lastAlerts = await getSystemSetting<LastAlertsMap>(LAST_ALERTS_KEY, {});
  lastAlerts[service] = new Date().toISOString();
  await setSystemSetting(LAST_ALERTS_KEY, lastAlerts, 'Last admin alert timestamps per service');
}

export async function processMonitorAlerts(checks: MonitorCheckResult[]): Promise<void> {
  const config = await getMonitoringConfig();
  if (!config.alertsEnabled) return;

  for (const check of checks) {
    const shouldAlert =
      check.status === 'error' || (check.status === 'warning' && config.notifyOnWarning);
    if (!shouldAlert) continue;

    const canSend = await shouldSendAlert(check.service, config.alertCooldownMinutes);
    if (!canSend) continue;

    await notifyAdminsAboutIssue(
      `Проблема: ${check.service}`,
      `${check.message}\nСтатус: ${check.status.toUpperCase()}`,
      { severity: check.status }
    );
    await markAlertSent(check.service);
  }
}

export async function getRecentMonitorLogs(limit = 50) {
  await ensureSystemMonitorLogTable();

  return (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT id, serviceName, status, message, latencyMs, details, checkedAt
       FROM SystemMonitorLog
       ORDER BY datetime(checkedAt) DESC
       LIMIT ?`,
      limit
    )
  )) as Array<{
    id: number;
    serviceName: string;
    status: string;
    message: string;
    latencyMs: number | null;
    details: string | null;
    checkedAt: string;
  }>;
}

export type SystemTestResult = {
  name: string;
  status: MonitorStatus;
  message: string;
  latencyMs: number;
};

export async function runConfiguredSystemTests(): Promise<SystemTestResult[]> {
  const baseUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const tests: SystemTestResult[] = [];

  const runFetchTest = async (name: string, path: string) => {
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        tests.push({
          name,
          status: 'error',
          message: `HTTP ${response.status}`,
          latencyMs,
        });
        return;
      }
      tests.push({
        name,
        status: 'ok',
        message: `HTTP ${response.status}`,
        latencyMs,
      });
    } catch (error) {
      tests.push({
        name,
        status: 'error',
        message: error instanceof Error ? error.message : 'Request failed',
        latencyMs: Date.now() - started,
      });
    }
  };

  await runFetchTest('health', '/api/health');
  await runFetchTest('home_activity', '/api/home-activity');
  await runFetchTest('listings_feed', '/api/listings?limit=1');

  const dbStarted = Date.now();
  try {
    await executeWithRetry(() => prisma.$queryRawUnsafe(`SELECT 1 as ok`));
    tests.push({
      name: 'database_query',
      status: 'ok',
      message: 'SELECT 1 OK',
      latencyMs: Date.now() - dbStarted,
    });
  } catch (error) {
    tests.push({
      name: 'database_query',
      status: 'error',
      message: error instanceof Error ? error.message : 'DB query failed',
      latencyMs: Date.now() - dbStarted,
    });
  }

  return tests;
}
