'use client';

import { useEffect, useState } from 'react';

type MonitorCheck = {
  service: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  latencyMs?: number;
};

type MonitorLog = {
  id: number;
  serviceName: string;
  status: string;
  message: string;
  latencyMs: number | null;
  checkedAt: string;
};

type MonitoringConfig = {
  alertsEnabled: boolean;
  notifyOnWarning: boolean;
  alertCooldownMinutes: number;
};

const STATUS_STYLES: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

export default function AdminMonitoringPage() {
  const [checks, setChecks] = useState<MonitorCheck[]>([]);
  const [logs, setLogs] = useState<MonitorLog[]>([]);
  const [config, setConfig] = useState<MonitoringConfig>({
    alertsEnabled: true,
    notifyOnWarning: false,
    alertCooldownMinutes: 30,
  });
  const [adminCount, setAdminCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/monitoring');
      if (response.ok) {
        const data = await response.json();
        setChecks(data.checks || []);
        setLogs(data.logs || []);
        setConfig(data.config);
        setAdminCount(data.administratorsConfigured || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveConfig = async () => {
    await fetch('/api/admin/monitoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_config', config }),
    });
    alert('Налаштування збережено');
  };

  const runChecks = async () => {
    setRunning(true);
    try {
      const response = await fetch('/api/admin/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_checks' }),
      });
      if (response.ok) {
        const data = await response.json();
        setChecks(data.checks || []);
        setLogs(data.logs || []);
      }
    } finally {
      setRunning(false);
    }
  };

  const testAlert = async () => {
    const response = await fetch('/api/admin/monitoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test_alert' }),
    });
    const data = await response.json();
    alert(`Тестове сповіщення: надіслано ${data.sent}, помилок ${data.failed}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Моніторинг систем</h1>
          <p className="mt-1 text-sm text-gray-600">
            Стан додатку, БД, бота, черг модерації та парсера
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void runChecks()}
            disabled={running}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {running ? 'Перевірка...' : 'Запустити перевірку'}
          </button>
          <button
            onClick={() => void testAlert()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Тест сповіщення в бот
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Адмінів для сповіщень у Telegram: <b>{adminCount}</b> (змінна <code>ADMINISTRATORS</code>).
        Cron: <code>POST /api/cron/monitor-systems</code> з Bearer <code>CRON_SECRET</code>.
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <div key={check.service} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900">{check.service}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLES[check.status]}`}
              >
                {check.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">{check.message}</p>
            {check.latencyMs != null && (
              <p className="mt-2 text-xs text-gray-400">{check.latencyMs} ms</p>
            )}
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Сповіщення адмінам</h2>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700">Увімкнути сповіщення про проблеми</span>
            <input
              type="checkbox"
              checked={config.alertsEnabled}
              onChange={(e) => setConfig({ ...config, alertsEnabled: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700">Сповіщати також про попередження (warning)</span>
            <input
              type="checkbox"
              checked={config.notifyOnWarning}
              onChange={(e) => setConfig({ ...config, notifyOnWarning: e.target.checked })}
            />
          </label>
          <label className="block text-sm text-gray-700">
            Кулдаун між однаковими алертами (хв)
            <input
              type="number"
              min={5}
              max={1440}
              value={config.alertCooldownMinutes}
              onChange={(e) =>
                setConfig({ ...config, alertCooldownMinutes: Number(e.target.value) || 30 })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            onClick={() => void saveConfig()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Зберегти налаштування
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Журнал перевірок</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-2 py-2">Час</th>
                <th className="px-2 py-2">Сервіс</th>
                <th className="px-2 py-2">Статус</th>
                <th className="px-2 py-2">Повідомлення</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                    {row.checkedAt?.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-2 py-2 text-gray-900">{row.serviceName}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLES[row.status] || 'bg-gray-100 text-gray-700'}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-gray-600">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
