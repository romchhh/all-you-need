'use client';

import { useEffect, useState } from 'react';
import type { AnalyticsTrackingConfig } from '@/constants/analyticsEvents';
import { DEFAULT_ANALYTICS_TRACKING_CONFIG } from '@/constants/analyticsEvents';

type TestResult = {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  latencyMs: number;
};

const TOGGLE_LABELS: Array<{ key: keyof AnalyticsTrackingConfig; label: string }> = [
  { key: 'trackCategoryClicks', label: 'Кліки по категоріях / підкатегоріях' },
  { key: 'trackContactSeller', label: 'Кнопка «Написати продавцю»' },
  { key: 'trackSearch', label: 'Пошук' },
  { key: 'trackFavorites', label: 'Обране' },
  { key: 'trackListingViews', label: 'Перегляди оголошень' },
  { key: 'trackCreateListing', label: 'Створення оголошень' },
  { key: 'trackShare', label: 'Поділитися' },
  { key: 'trackNavigation', label: 'Навігація / місто / онбординг' },
  { key: 'trackPromotions', label: 'Реклама / просування' },
];

export default function AdminTestingPage() {
  const [config, setConfig] = useState<AnalyticsTrackingConfig>(
    DEFAULT_ANALYTICS_TRACKING_CONFIG
  );
  const [lastTests, setLastTests] = useState<{ ranAt: string | null; results: TestResult[] | null }>(
    { ranAt: null, results: null }
  );
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/testing');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setLastTests(data.lastTests);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveConfig = async () => {
    await fetch('/api/admin/testing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_config', config }),
    });
    alert('Налаштування збережено');
  };

  const runTests = async () => {
    setRunning(true);
    try {
      const response = await fetch('/api/admin/testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_tests' }),
      });
      if (response.ok) {
        const data = await response.json();
        setLastTests({ ranAt: data.ranAt, results: data.results });
      }
    } finally {
      setRunning(false);
    }
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Тестування системи</h1>
        <p className="mt-1 text-sm text-gray-600">
          Налаштування збору статистики по основних діях користувача та smoke-тести API
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Збір аналітики</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            />
            Увімкнено
          </label>
        </div>

        <div className="space-y-3">
          {TOGGLE_LABELS.map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-700">{item.label}</span>
              <input
                type="checkbox"
                checked={config[item.key] as boolean}
                onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
              />
            </label>
          ))}
        </div>

        <button
          onClick={() => void saveConfig()}
          className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          Зберегти налаштування
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Smoke-тести API</h2>
            <p className="text-sm text-gray-500">
              Перевірка health, home-activity, listings feed та БД
            </p>
          </div>
          <button
            onClick={() => void runTests()}
            disabled={running}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {running ? 'Запуск...' : 'Запустити тести'}
          </button>
        </div>

        {lastTests.ranAt && (
          <p className="mb-3 text-xs text-gray-500">
            Останній запуск: {new Date(lastTests.ranAt).toLocaleString('uk-UA')}
          </p>
        )}

        <div className="space-y-2">
          {(lastTests.results ?? []).map((test) => (
            <div
              key={test.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm"
            >
              <span className="font-medium text-gray-900">{test.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                  test.status === 'ok'
                    ? 'bg-green-100 text-green-800'
                    : test.status === 'warning'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                }`}
              >
                {test.status}
              </span>
              <span className="w-full text-gray-600 sm:w-auto">
                {test.message} · {test.latencyMs} ms
              </span>
            </div>
          ))}
          {(lastTests.results?.length ?? 0) === 0 && (
            <p className="text-sm text-gray-500">Тести ще не запускались</p>
          )}
        </div>
      </div>
    </div>
  );
}
