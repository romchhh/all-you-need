'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Eye,
  HelpCircle,
  LineChart,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import SimpleChart from '@/components/admin/SimpleChart';
import type { AnalyticsSummary } from '@/lib/analytics/analyticsStore';
import {
  categoryLabel,
  eventLabel,
  EVENT_GROUP_HINTS,
  EVENT_GROUP_LABELS,
  formatCount,
  pct,
} from '@/lib/analytics/analyticsDisplay';

type StatTone = 'indigo' | 'violet' | 'blue' | 'emerald' | 'amber' | 'slate';

const TONE_STYLES: Record<
  StatTone,
  { card: string; icon: string; value: string; ring: string }
> = {
  indigo: {
    card: 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200',
    icon: 'bg-indigo-100 text-indigo-700',
    value: 'text-indigo-900',
    ring: 'ring-indigo-400',
  },
  violet: {
    card: 'bg-gradient-to-br from-violet-50 to-white border-violet-200',
    icon: 'bg-violet-100 text-violet-700',
    value: 'text-violet-900',
    ring: 'ring-violet-400',
  },
  blue: {
    card: 'bg-gradient-to-br from-blue-50 to-white border-blue-200',
    icon: 'bg-blue-100 text-blue-700',
    value: 'text-blue-900',
    ring: 'ring-blue-400',
  },
  emerald: {
    card: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200',
    icon: 'bg-emerald-100 text-emerald-700',
    value: 'text-emerald-900',
    ring: 'ring-emerald-400',
  },
  amber: {
    card: 'bg-gradient-to-br from-amber-50 to-white border-amber-200',
    icon: 'bg-amber-100 text-amber-700',
    value: 'text-amber-900',
    ring: 'ring-amber-400',
  },
  slate: {
    card: 'bg-gradient-to-br from-slate-50 to-white border-slate-200',
    icon: 'bg-slate-100 text-slate-600',
    value: 'text-slate-900',
    ring: 'ring-slate-400',
  },
};

const GUIDE_STEPS = [
  {
    title: '1. Збір подій',
    text: 'Кожна дія в Telegram Web App (перегляд, пошук, контакт, обране) надсилається на сервер і зберігається в AnalyticsEvent.',
  },
  {
    title: '2. Групи подій',
    text: 'navigation — навігація; listing — оголошення; search — пошук; engagement — обране/поділитися; monetization — просування.',
  },
  {
    title: '3. Конверсія',
    text: 'Головна метрика для продавців: скільки переглядів оголошення (listing_view) перетворюються на «Написати продавцю» (contact_seller).',
  },
  {
    title: '4. Налаштування',
    text: 'Які події відстежуються і як — у розділі «Тестування трекінгу». Якщо метрика нульова — перевірте, чи увімкнено трекінг у проді.',
  },
];

function periodLabel(days: number): string {
  if (days === 7) return 'за 7 днів';
  if (days === 90) return 'за 90 днів';
  return 'за 30 днів';
}

function countByEvent(data: AnalyticsSummary | null, name: string): number {
  return data?.byEvent.find((e) => e.eventName === name)?.count ?? 0;
}

function formatEntity(row: AnalyticsSummary['recentEvents'][0]): ReactNode {
  if (!row.entityType || !row.entityId) return '—';
  if (row.entityType === 'listing') {
    return (
      <Link
        href={`/admin/listings/${row.entityId}`}
        className="text-indigo-600 hover:underline"
      >
        Оголошення №{row.entityId}
      </Link>
    );
  }
  if (row.entityType === 'category') {
    return categoryLabel(row.entityId);
  }
  if (row.entityType === 'query') {
    return `«${row.entityId}»`;
  }
  return `${row.entityType}: ${row.entityId}`;
}

function RankedBars({
  title,
  hint,
  rows,
  maxItems = 12,
  renderLabel,
}: {
  title: string;
  hint?: string;
  rows: Array<{ key: string; label: string; count: number; href?: string }>;
  maxItems?: number;
  renderLabel?: (row: { key: string; label: string; count: number; href?: string }) => ReactNode;
}) {
  const slice = rows.slice(0, maxItems);
  const max = Math.max(...slice.map((r) => r.count), 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm h-full">
      <h2 className="text-base md:text-lg font-semibold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-500 mt-1 mb-4">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {slice.length === 0 ? (
        <p className="text-sm text-gray-500">Поки немає даних за обраний період</p>
      ) : (
        <ul className="space-y-3">
          {slice.map((row, index) => {
            const width = Math.max(4, (row.count / max) * 100);
            const labelNode = renderLabel ? (
              renderLabel(row)
            ) : row.href ? (
              <Link href={row.href} className="text-indigo-600 hover:underline truncate block">
                {row.label}
              </Link>
            ) : (
              <span className="truncate block text-gray-800">{row.label}</span>
            );
            return (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                      {index + 1}
                    </span>
                    {labelNode}
                  </span>
                  <span className="font-semibold tabular-nums text-gray-900 shrink-0">
                    {formatCount(row.count)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500/80 transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  hint,
  icon: Icon,
  tone,
  showHint,
}: {
  label: string;
  value: string;
  sub?: string;
  hint: string;
  icon: typeof Activity;
  tone: StatTone;
  showHint: boolean;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`rounded-xl border p-4 ${s.card}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`rounded-lg p-2 ${s.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        {sub && (
          <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{sub}</span>
        )}
      </div>
      <p className="text-xs font-medium text-gray-600 mb-0.5">{label}</p>
      <p className={`text-2xl md:text-3xl font-bold tabular-nums ${s.value}`}>{value}</p>
      {showHint && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{hint}</p>}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  const load = useCallback(async (period = days) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/analytics?days=${period}`);
      if (response.ok) {
        setData(await response.json());
      }
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const listingViews = countByEvent(data, 'listing_view');
  const contacts = countByEvent(data, 'contact_seller');
  const searches = countByEvent(data, 'search_submit');
  const conversionRate =
    listingViews > 0 ? `${Math.round((contacts / listingViews) * 1000) / 10}%` : '—';

  const period = periodLabel(days);

  const funnelSteps = useMemo(
    () => [
      { label: 'Перегляди оголошень', count: listingViews, color: 'bg-blue-500' },
      { label: '«Написати продавцю»', count: contacts, color: 'bg-emerald-500' },
      {
        label: 'Поділитися',
        count: countByEvent(data, 'share_listing'),
        color: 'bg-violet-500',
      },
      {
        label: 'В обране',
        count: countByEvent(data, 'favorite_add'),
        color: 'bg-amber-500',
      },
    ],
    [data, listingViews, contacts]
  );

  const maxFunnel = Math.max(...funnelSteps.map((s) => s.count), 1);

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Аналітика маркетплейсу</h1>
          <p className="text-gray-600 text-sm md:text-base max-w-2xl">
            Дії користувачів у Telegram Web App: перегляди, пошук, контакти з продавцями та
            залучення. Дані оновлюються при кожному завантаженні сторінки.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value={7}>7 днів</option>
            <option value={30}>30 днів</option>
            <option value={90}>90 днів</option>
          </select>
          <button
            type="button"
            onClick={() => void load(days)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Оновити
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-800">
            <MousePointerClick className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-indigo-900">Що тут рахується</p>
            <p className="text-sm text-indigo-800/90 mt-1">
              Події збираються з клієнта маркетплейсу (не з парсера). Період:{' '}
              <strong>{period}</strong>. Середньо{' '}
              <strong>{formatCount(data?.avgEventsPerDay ?? 0)}</strong> подій на день. Налаштування
              трекінгу —{' '}
              <Link href="/admin/testing" className="underline font-medium hover:text-indigo-950">
                адмін → тестування
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ключові показники · {period}
        </h2>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {showGuide ? 'Сховати підказки' : 'Показати підказки'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Усього подій"
          value={formatCount(data?.totalEvents ?? 0)}
          sub={period}
          hint="Кожна зафіксована дія: клік, перегляд, пошук, контакт тощо."
          icon={Activity}
          tone="indigo"
          showHint={showGuide}
        />
        <KpiCard
          label="Унікальні користувачі"
          value={formatCount(data?.uniqueUsers ?? 0)}
          sub={period}
          hint="Різні Telegram-ID або акаунти з хоча б однією подією за період."
          icon={Users}
          tone="violet"
          showHint={showGuide}
        />
        <KpiCard
          label="Перегляди оголошень"
          value={formatCount(listingViews)}
          sub={period}
          hint="Відкриття картки оголошення (listing_view) — базовий інтерес до контенту."
          icon={Eye}
          tone="blue"
          showHint={showGuide}
        />
        <KpiCard
          label="«Написати продавцю»"
          value={formatCount(contacts)}
          sub={period}
          hint="Натискання кнопки контакту — головна конверсія для продавців."
          icon={MessageCircle}
          tone="emerald"
          showHint={showGuide}
        />
        <KpiCard
          label="Конверсія в контакт"
          value={conversionRate}
          sub="views → contact"
          hint="contact_seller ÷ listing_view. Вище 5–10% — добре для класифайду."
          icon={TrendingUp}
          tone="amber"
          showHint={showGuide}
        />
        <KpiCard
          label="Пошукові запити"
          value={formatCount(searches)}
          sub={period}
          hint="Натискання «шукати» з текстом у рядку пошуку (search_submit)."
          icon={Search}
          tone="slate"
          showHint={showGuide}
        />
      </div>

      {showGuide && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-500" />
            Як читати ці цифри
          </h3>
          <ol className="grid gap-3 md:grid-cols-2">
            {GUIDE_STEPS.map((step) => (
              <li
                key={step.title}
                className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm"
              >
                <p className="font-medium text-gray-900">{step.title}</p>
                <p className="text-gray-600 mt-0.5 leading-snug">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <LineChart className="h-5 w-5 text-indigo-600" />
          Воронка залучення
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Від перегляду до дії. Ширина смуги — частка від найбільшого кроку (перегляди).
        </p>
        <div className="space-y-4">
          {funnelSteps.map((step) => (
            <div key={step.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{step.label}</span>
                <span className="font-semibold tabular-nums">
                  {formatCount(step.count)}
                  {listingViews > 0 && step.label.includes('Написати') && (
                    <span className="text-gray-500 font-normal ml-1">
                      ({pct(step.count, listingViews)} від переглядів)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${step.color} transition-all`}
                  style={{ width: `${Math.max(2, (step.count / maxFunnel) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm overflow-hidden">
          <SimpleChart
            title={`Активність за днями · ${period}`}
            data={(data?.dailyEvents ?? []).map((row) => ({
              date: row.date,
              count: row.count,
            }))}
            color="#4f46e5"
            height={220}
          />
          {data && data.dailyEvents.length > 0 && (
            <p className="text-xs text-gray-500 mt-2 px-1">
              Пік:{' '}
              {formatCount(Math.max(...data.dailyEvents.map((d) => d.count)))} подій за один день
            </p>
          )}
        </div>

        <RankedBars
          title="Групи подій"
          hint="Як класифіковані дії в коді (eventGroup). Допомагає зрозуміти, де користувачі проводять час."
          rows={(data?.byEventGroup ?? []).map((row) => ({
            key: row.eventGroup,
            label: EVENT_GROUP_LABELS[row.eventGroup] || row.eventGroup,
            count: row.count,
          }))}
          renderLabel={(row) => (
            <span className="truncate block">
              <span className="text-gray-900 font-medium">{row.label}</span>
              {EVENT_GROUP_HINTS[row.key] && (
                <span className="block text-[11px] text-gray-500 font-normal">
                  {EVENT_GROUP_HINTS[row.key]}
                </span>
              )}
            </span>
          )}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RankedBars
          title="Типи подій"
          hint="Детальний розклад усіх eventName за період."
          rows={(data?.byEvent ?? []).map((row) => ({
            key: row.eventName,
            label: eventLabel(row.eventName),
            count: row.count,
          }))}
        />

        <RankedBars
          title="Топ категорій"
          hint="Кліки по категоріях і підкатегоріях (category_click + subcategory_click)."
          rows={(data?.topCategories ?? []).map((row) => ({
            key: row.category,
            label: categoryLabel(row.category),
            count: row.count,
          }))}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RankedBars
          title="Топ пошукових запитів"
          hint="Текст, який користувачі вводили перед натисканням «шукати»."
          rows={(data?.topSearches ?? []).map((row) => ({
            key: row.query,
            label: `«${row.query}»`,
            count: row.count,
          }))}
        />

        <RankedBars
          title="Топ оголошень за переглядами"
          hint="Найчастіше відкривані картки (listing_view)."
          rows={(data?.topViewedListings ?? []).map((row) => ({
            key: row.listingId,
            label: row.title ? `#${row.listingId} · ${row.title}` : `№${row.listingId}`,
            count: row.count,
            href: `/admin/listings/${row.listingId}`,
          }))}
        />
      </div>

      <div className="mb-6">
        <RankedBars
          title="Топ оголошень за контактами"
          hint="Оголошення, з яких найчастіше натискали «Написати продавцю»."
          maxItems={15}
          rows={(data?.topContactListings ?? []).map((row) => ({
            key: row.listingId,
            label: row.title ? `#${row.listingId} · ${row.title}` : `№${row.listingId}`,
            count: row.count,
            href: `/admin/listings/${row.listingId}`,
          }))}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <h2 className="mb-1 text-base md:text-lg font-semibold text-gray-900">Останні 50 подій</h2>
        <p className="text-xs text-gray-500 mb-4">Live-стрічка без фільтра періоду — для дебагу трекінгу.</p>
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-2 py-2 font-medium">Час</th>
                <th className="px-2 py-2 font-medium">Подія</th>
                <th className="px-2 py-2 font-medium">Контекст</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentEvents ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-2 py-2 whitespace-nowrap text-gray-600 tabular-nums">
                    {row.createdAt?.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-2 py-2 text-gray-900">{eventLabel(row.eventName)}</td>
                  <td className="px-2 py-2 text-gray-600 max-w-xs truncate">{formatEntity(row)}</td>
                </tr>
              ))}
              {(data?.recentEvents?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-6 text-center text-gray-500">
                    Подій ще немає — перевірте трекінг у{' '}
                    <Link href="/admin/testing" className="text-indigo-600 underline">
                      тестуванні
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
