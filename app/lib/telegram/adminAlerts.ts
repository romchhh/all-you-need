import { sendTelegramMessage } from '@/lib/telegram/telegramNotifications';

export type MonitorStatus = 'ok' | 'warning' | 'error';

export type MonitorCheckResult = {
  service: string;
  status: MonitorStatus;
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
};

export type MonitoringConfig = {
  alertsEnabled: boolean;
  notifyOnWarning: boolean;
  alertCooldownMinutes: number;
};

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  alertsEnabled: true,
  notifyOnWarning: false,
  alertCooldownMinutes: 30,
};

export function parseAdministratorIds(): number[] {
  const raw = process.env.ADMINISTRATORS?.trim();
  if (!raw) return [];

  const cleaned = raw.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export async function notifyAdminsAboutIssue(
  title: string,
  details: string,
  options: { severity?: MonitorStatus } = {}
): Promise<{ sent: number; failed: number }> {
  const adminIds = parseAdministratorIds();
  if (adminIds.length === 0) {
    console.warn('ADMINISTRATORS is not configured — admin alert skipped');
    return { sent: 0, failed: 0 };
  }

  const icon =
    options.severity === 'error' ? '🚨' : options.severity === 'warning' ? '⚠️' : 'ℹ️';

  const message = `${icon} <b>${title}</b>\n\n${details}\n\n<i>TradeGround monitoring</i>`;

  let sent = 0;
  let failed = 0;

  for (const adminId of adminIds) {
    const ok = await sendTelegramMessage(adminId, message);
    if (ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed };
}
