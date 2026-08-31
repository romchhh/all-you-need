'use client';

import { useEffect, useState } from 'react';
import SimpleChart from '@/components/admin/SimpleChart';

type AnalyticsData = {
  totalEvents: number;
  periodDays: number;
  byEvent: Array<{ eventName: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  topContactListings: Array<{ listingId: string; count: number }>;
  dailyEvents: Array<{ date: string; count: number }>;
  recentEvents: Array<{
    id: number;
    eventName: string;
    entityType: string | null;
    entityId: string | null;
    metadata: string | null;
    createdAt: string;
  }>;
};

const EVENT_LABELS: Record<string, string> = {
  category_click: 'Клік по категорії',
  subcategory_click: 'Клік по підкатегорії',
  listing_view: 'Перегляд оголошення',
  contact_seller: 'Написати продавцю',
  favorite_add: 'Додати в обране',
  favorite_remove: 'Прибрати з обраного',
  search_submit: 'Пошук',
  share_listing: 'Поділитися',
  create_listing_start: 'Створення оголошення (старт)',
  create_listing_submit: 'Створення оголошення (відправка)',
  promotion_view: 'Перегляд реклами',
  promotion_select: 'Вибір реклами',
  nav_tab_click: 'Навігація',
  city_select: 'Вибір міста',
  onboarding_action: 'Онбординг',
  profile_view: 'Профіль',
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = async (period = days) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/analytics?days=${period}`);
      if (response.ok) {
        setData(await response.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(days);
  }, [days]);

  if (loading && !data) {
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
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Аналітика кліків</h1>
          <p className="mt-1 text-sm text-gray-600">
            Статистика основних дій користувачів у маркетплейсі
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value={7}>7 днів</option>
          <option value={30}>30 днів</option>
          <option value={90}>90 днів</option>
        </select>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Усього подій</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{data?.totalEvents ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">«Написати продавцю»</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {data?.byEvent.find((e) => e.eventName === 'contact_seller')?.count ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Кліків по категоріях</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {(data?.byEvent.find((e) => e.eventName === 'category_click')?.count ?? 0) +
              (data?.byEvent.find((e) => e.eventName === 'subcategory_click')?.count ?? 0)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SimpleChart
            title="Події за днями"
            data={(data?.dailyEvents ?? []).map((row) => ({
              date: row.date.slice(5),
              count: row.count,
            }))}
            color="#4f46e5"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Типи подій</h2>
          <div className="space-y-2">
            {(data?.byEvent ?? []).map((row) => (
              <div key={row.eventName} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {EVENT_LABELS[row.eventName] || row.eventName}
                </span>
                <span className="font-semibold text-gray-900">{row.count}</span>
              </div>
            ))}
            {(data?.byEvent?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">Поки немає даних</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Топ категорій</h2>
          <div className="space-y-2">
            {(data?.topCategories ?? []).map((row) => (
              <div key={row.category} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-700">{row.category}</span>
                <span className="font-semibold text-gray-900">{row.count}</span>
              </div>
            ))}
            {(data?.topCategories?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">Поки немає даних</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Топ оголошень за кліками «Написати»
          </h2>
          <div className="space-y-2">
            {(data?.topContactListings ?? []).map((row) => (
              <div key={row.listingId} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">№{row.listingId}</span>
                <span className="font-semibold text-gray-900">{row.count}</span>
              </div>
            ))}
            {(data?.topContactListings?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">Поки немає даних</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Останні події</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-2 py-2">Час</th>
                <th className="px-2 py-2">Подія</th>
                <th className="px-2 py-2">Сутність</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentEvents ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                    {row.createdAt?.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-2 py-2 text-gray-900">
                    {EVENT_LABELS[row.eventName] || row.eventName}
                  </td>
                  <td className="px-2 py-2 text-gray-600">
                    {row.entityType ? `${row.entityType}:${row.entityId}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
