'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  CheckCircle2,
  Clock,
  Filter,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';

type TabId =
  | 'pending_manual'
  | 'auto_published'
  | 'rejected'
  | 'skipped'
  | 'channel_pending';

interface QueueStats {
  pendingManual: number;
  autoPublished: number;
  rejected: number;
  channelPending: number;
  skipped: number;
  autoPublishedToday: number;
}

interface QueueItem {
  id: number;
  source_channel: string;
  source_city?: string;
  title?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  price?: string;
  location?: string;
  skip_reason?: string;
  review_note?: string;
  raw_text_preview?: string;
  msg_link?: string;
  marketplace_listing_id?: number | null;
  parser_type?: string;
  channel_mod_status?: string;
  created_at?: string;
  images?: string[];
}

const PERIOD_NOTE = 'за останні 7 днів';

const TABS: { id: TabId; label: string; hint: string }[] = [
  {
    id: 'pending_manual',
    label: 'Ручна перевірка',
    hint: 'Оголошення в Telegram-групі модерації — потрібні кнопки ✅/❌',
  },
  {
    id: 'auto_published',
    label: 'Авто на МП',
    hint: 'Бот опублікував на маркетплейс без участі модератора',
  },
  {
    id: 'channel_pending',
    label: 'Канал очікує',
    hint: 'На МП уже є; для Telegram-каналу послуг — «✅ У канал»',
  },
  {
    id: 'skipped',
    label: 'AI / фільтр skip',
    hint: 'Пост не потрапив у чергу — відсіяно AI або правилами якості',
  },
  {
    id: 'rejected',
    label: 'Відхилено модератором',
    hint: 'Модератор натиснув ❌ у Telegram-групі',
  },
];

const WORKFLOW_STEPS = [
  {
    title: '1. Парсинг каналу',
    text: 'Бот зчитує нові пости з Telegram-груп/каналів і прогоняє їх через AI-фільтр.',
  },
  {
    title: '2. Автопублікація на МП',
    text: 'Релевантні оголошення (товари та більшість послуг) бот публікує на маркетплейс автоматично — до ~450/день.',
  },
  {
    title: '3. Ручна модерація',
    text: 'Якщо автопублікація не спрацювала (ліміт, якість, дублікат) — картка потрапляє в Telegram-групу модерації.',
  },
  {
    title: '4. Канали послуг',
    text: 'Публікація в Telegram-канали Hamburg/Germany — лише вручну кнопкою «✅ У канал», навіть після автопублікації на МП.',
  },
];

function parsedImageUrl(path: string): string {
  const clean = path.replace(/^database\/parsed_photos\//, '').replace(/^parsed_photos\//, '');
  return `/api/parsed-images/${clean}`;
}

function formatCount(n: number): string {
  return n.toLocaleString('uk-UA');
}

export default function ParserQueuePage() {
  const [tab, setTab] = useState<TabId>('pending_manual');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipReasons, setSkipReasons] = useState<Array<{ reason: string; count: number }>>([]);
  const [channelFilter, setChannelFilter] = useState('');
  const [showGuide, setShowGuide] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/parser/queue', { method: 'POST' });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, limit: '50', days: '7' });
      if (channelFilter.trim()) params.set('channel', channelFilter.trim());
      const res = await fetch(`/api/admin/parser/queue?${params}`);
      if (!res.ok) {
        setItems([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSkipReasons(data.skipReasons || []);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, channelFilter]);

  useEffect(() => {
    fetchStats();
    fetchItems();
  }, [fetchStats, fetchItems]);

  const statCards = stats
    ? [
        {
          key: 'autoPublishedToday',
          tab: 'auto_published' as TabId,
          label: 'Сьогодні авто МП',
          value: stats.autoPublishedToday,
          period: 'сьогодні (календарний день)',
          description:
            'Скільки оголошень бот автоматично опублікував на маркетплейс сьогодні. Лічильник скидається опівночі за локальним часом сервера.',
          icon: Sparkles,
          tone: 'emerald' as const,
          highlight: true,
        },
        {
          key: 'pendingManual',
          tab: 'pending_manual' as TabId,
          label: 'Ручна перевірка',
          value: stats.pendingManual,
          period: PERIOD_NOTE,
          description:
            'Оголошення збережені в черзі, але ще не на маркетплейсі. Чекають рішення модератора в Telegram-групі (✅ опублікувати / ❌ відхилити).',
          icon: Clock,
          tone: 'amber' as const,
        },
        {
          key: 'autoPublished',
          tab: 'auto_published' as TabId,
          label: 'Авто на МП',
          value: stats.autoPublished,
          period: PERIOD_NOTE,
          description:
            'Успішно автопубліковані на маркетплейс оголошення — без ручного підтвердження. Включає товари та послуги.',
          icon: CheckCircle2,
          tone: 'green' as const,
        },
        {
          key: 'channelPending',
          tab: 'channel_pending' as TabId,
          label: 'Канал очікує',
          value: stats.channelPending,
          period: PERIOD_NOTE,
          description:
            'Послуги вже на маркетплейсі (автопублікація), але ще не опубліковані в Telegram-каналі Hamburg/Germany. Потрібна кнопка «✅ У канал».',
          icon: Send,
          tone: 'blue' as const,
        },
        {
          key: 'skipped',
          tab: 'skipped' as TabId,
          label: 'AI / фільтр skip',
          value: stats.skipped,
          period: PERIOD_NOTE,
          description:
            'Пости, які парсер навіть не додав у чергу: спам, новини, дублікати, «куплю/шукаю», низька якість або відхилення AI.',
          icon: Filter,
          tone: 'slate' as const,
        },
        {
          key: 'rejected',
          tab: 'rejected' as TabId,
          label: 'Відхилено',
          value: stats.rejected,
          period: PERIOD_NOTE,
          description:
            'Оголошення, які модератор явно відхилив у Telegram-групі. На маркетплейс не потрапили (або зняті з модерації).',
          icon: XCircle,
          tone: 'rose' as const,
        },
      ]
    : [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Парсер — черга</h1>
          <p className="text-gray-600 text-sm md:text-base max-w-2xl">
            Моніторинг потоку з Telegram-каналів: автопублікація на маркетплейс і ручна модерація
            для каналів послуг.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchStats();
            fetchItems();
          }}
          className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Оновити все
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-100 p-2 text-emerald-800">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-900">Як працює парсер</p>
            <p className="text-sm text-emerald-800/90 mt-1">
              <strong>Маркетплейс</strong> — автопублікація ботом (команда{' '}
              <code className="rounded bg-white/80 px-1">/parse</code> або за розкладом).{' '}
              <strong>Telegram-канали послуг</strong> — лише ручне підтвердження модератором.
            </p>
          </div>
        </div>
      </div>

      {stats && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Зведена статистика
            </h2>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showGuide ? 'Сховати підказки' : 'Показати підказки'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
            {statCards.map(({ key: cardKey, tab: cardTab, ...card }) => (
              <StatCard
                key={cardKey}
                {...card}
                active={tab === cardTab}
                showDescription={showGuide}
                onClick={() => setTab(cardTab)}
              />
            ))}
          </div>
        </>
      )}

      {showGuide && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-500" />
            Покроковий процес
          </h3>
          <ol className="grid gap-3 md:grid-cols-2">
            {WORKFLOW_STEPS.map((step) => (
              <li
                key={step.title}
                className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm"
              >
                <p className="font-medium text-gray-900">{step.title}</p>
                <p className="text-gray-600 mt-0.5 leading-snug">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-gray-500 flex items-start gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Натисніть на картку статистики — відкриється відповідна вкладка зі списком записів.
            Числа в картках (крім «Сьогодні») — {PERIOD_NOTE.toLowerCase()}.
          </p>
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Вкладки списку</p>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                tab === t.id
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              title={t.hint}
            >
              <span>{t.label}</span>
              {tab === t.id && (
                <span className="block text-[10px] font-normal opacity-90 mt-0.5 max-w-[220px] leading-tight">
                  {t.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Фільтр каналу (@username)"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={fetchItems}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          Застосувати фільтр
        </button>
      </div>

      {tab === 'skipped' && skipReasons.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <p className="font-medium text-amber-900 mb-2">Топ причин skip (7 днів)</p>
          <p className="text-xs text-amber-800/80 mb-2">
            Чому пости не потрапили в чергу модерації — дублікат, спам, «не оголошення», AI тощо.
          </p>
          <div className="flex flex-wrap gap-2">
            {skipReasons.map((r) => (
              <span
                key={r.reason}
                className="px-2.5 py-1 bg-white rounded-md border border-amber-200 text-amber-900 text-xs font-medium"
              >
                {r.reason}: {formatCount(r.count)}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Немає записів</p>
          <p className="text-sm">У цій вкладці за останні 7 днів (з урахуванням фільтра каналу)</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">
            Знайдено: <strong className="text-gray-900">{formatCount(total)}</strong>
            {channelFilter.trim() ? ` · канал «${channelFilter.trim()}»` : ''}
          </p>
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={`${tab}-${item.id}`}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-gray-300 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {item.title || item.skip_reason || `ID ${item.id}`}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      @{item.source_channel}
                      {item.source_city ? ` · ${item.source_city}` : ''}
                      {item.category ? ` · ${item.category}` : ''}
                      {item.created_at ? ` · ${item.created_at}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.marketplace_listing_id && (
                      <Link
                        href={`/admin/listings/${item.marketplace_listing_id}`}
                        className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md font-medium hover:bg-emerald-100"
                      >
                        МП #{item.marketplace_listing_id}
                      </Link>
                    )}
                    {item.msg_link && (
                      <a
                        href={item.msg_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1 bg-blue-50 text-blue-800 rounded-md font-medium hover:bg-blue-100"
                      >
                        Оригінал
                      </a>
                    )}
                  </div>
                </div>

                {(item.review_note || item.skip_reason) && (
                  <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2 mb-2 border border-amber-100">
                    {item.review_note || item.skip_reason}
                  </p>
                )}

                {item.description && (
                  <p className="text-sm text-gray-700 line-clamp-3 mb-2">{item.description}</p>
                )}
                {item.raw_text_preview && !item.description && (
                  <p className="text-sm text-gray-600 line-clamp-3 mb-2">{item.raw_text_preview}</p>
                )}

                {item.images && item.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto mt-2">
                    {item.images.slice(0, 4).map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={img}
                        src={parsedImageUrl(img)}
                        alt=""
                        className="h-16 w-16 object-cover rounded-lg border"
                      />
                    ))}
                  </div>
                )}

                {tab === 'pending_manual' && (
                  <p className="text-xs text-amber-800 bg-amber-50/80 rounded-md px-2 py-1.5 mt-2 inline-block">
                    Підтвердіть у Telegram-групі модерації (кнопки ✅ / ❌)
                  </p>
                )}
                {tab === 'channel_pending' && (
                  <p className="text-xs text-blue-800 bg-blue-50 rounded-md px-2 py-1.5 mt-2 inline-block">
                    На МП уже є — для каналу натисніть «✅ У канал» у Telegram
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type StatTone = 'emerald' | 'amber' | 'green' | 'blue' | 'slate' | 'rose';

const TONE_STYLES: Record<
  StatTone,
  { card: string; icon: string; value: string; ring: string }
> = {
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
  green: {
    card: 'bg-gradient-to-br from-green-50 to-white border-green-200',
    icon: 'bg-green-100 text-green-700',
    value: 'text-green-900',
    ring: 'ring-green-400',
  },
  blue: {
    card: 'bg-gradient-to-br from-blue-50 to-white border-blue-200',
    icon: 'bg-blue-100 text-blue-700',
    value: 'text-blue-900',
    ring: 'ring-blue-400',
  },
  slate: {
    card: 'bg-gradient-to-br from-slate-50 to-white border-slate-200',
    icon: 'bg-slate-100 text-slate-600',
    value: 'text-slate-900',
    ring: 'ring-slate-400',
  },
  rose: {
    card: 'bg-gradient-to-br from-rose-50 to-white border-rose-200',
    icon: 'bg-rose-100 text-rose-700',
    value: 'text-rose-900',
    ring: 'ring-rose-400',
  },
};

function StatCard({
  label,
  value,
  period,
  description,
  icon: Icon,
  tone,
  highlight = false,
  active = false,
  showDescription = true,
  onClick,
}: {
  label: string;
  value: number;
  period: string;
  description: string;
  icon: typeof Sparkles;
  tone: StatTone;
  highlight?: boolean;
  active?: boolean;
  showDescription?: boolean;
  onClick: () => void;
}) {
  const s = TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 ${s.card} ${
        active ? `ring-2 ${s.ring} shadow-sm` : ''
      } ${highlight ? 'sm:col-span-2 xl:col-span-1' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`rounded-lg p-2 ${s.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{period}</span>
      </div>
      <p className="text-xs font-medium text-gray-600 mb-0.5">{label}</p>
      <p className={`text-2xl md:text-3xl font-bold tabular-nums ${s.value}`}>
        {formatCount(value)}
      </p>
      {showDescription && (
        <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-3">{description}</p>
      )}
      <p className="text-[10px] text-gray-400 mt-2">Натисніть → список</p>
    </button>
  );
}
