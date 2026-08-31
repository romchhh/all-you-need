'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

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

const TABS: { id: TabId; label: string; hint: string }[] = [
  {
    id: 'pending_manual',
    label: 'Ручна перевірка',
    hint: 'AI пропустив або не вистачило слотів автопублікації',
  },
  {
    id: 'auto_published',
    label: 'Авто на МП',
    hint: 'Автоматично опубліковано на маркетплейс',
  },
  {
    id: 'channel_pending',
    label: 'Канал очікує',
    hint: 'На МП є, канал — ручне підтвердження',
  },
  {
    id: 'skipped',
    label: 'Відхилено AI/фільтром',
    hint: 'Не збережено в чергу — AI або якість',
  },
  {
    id: 'rejected',
    label: 'Відхилено модератором',
    hint: 'Відхилено в Telegram-групі',
  },
];

function parsedImageUrl(path: string): string {
  const clean = path.replace(/^database\/parsed_photos\//, '').replace(/^parsed_photos\//, '');
  return `/api/parsed-images/${clean}`;
}

export default function ParserQueuePage() {
  const [tab, setTab] = useState<TabId>('pending_manual');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipReasons, setSkipReasons] = useState<Array<{ reason: string; count: number }>>([]);
  const [channelFilter, setChannelFilter] = useState('');

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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Парсер — черга</h1>
        <p className="text-gray-600 text-sm md:text-base">
          Маркетплейс: автопублікація. Канали послуг: ручне підтвердження в Telegram.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Сьогодні авто МП" value={stats.autoPublishedToday} accent />
          <StatCard label="Ручна перевірка" value={stats.pendingManual} />
          <StatCard label="Авто на МП (7д)" value={stats.autoPublished} />
          <StatCard label="Канал очікує" value={stats.channelPending} />
          <StatCard label="AI/фільтр skip" value={stats.skipped} />
          <StatCard label="Відхилено" value={stats.rejected} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-emerald-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Фільтр каналу (@username)"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={fetchItems}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm"
        >
          Оновити
        </button>
      </div>

      {tab === 'skipped' && skipReasons.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-medium text-amber-900 mb-2">Топ причин відхилення (7 днів):</p>
          <div className="flex flex-wrap gap-2">
            {skipReasons.map((r) => (
              <span key={r.reason} className="px-2 py-0.5 bg-white rounded border text-amber-800">
                {r.reason}: {r.count}
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
        <div className="bg-white rounded-lg border p-10 text-center text-gray-500">
          Немає записів у цій вкладці за останні 7 днів
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">Знайдено: {total}</p>
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={`${tab}-${item.id}`}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {item.title || item.skip_reason || `ID ${item.id}`}
                    </h2>
                    <p className="text-xs text-gray-500">
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
                        className="text-xs px-2 py-1 bg-emerald-50 text-emerald-800 rounded"
                      >
                        МП #{item.marketplace_listing_id}
                      </Link>
                    )}
                    {item.msg_link && (
                      <a
                        href={item.msg_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-800 rounded"
                      >
                        Оригінал
                      </a>
                    )}
                  </div>
                </div>

                {(item.review_note || item.skip_reason) && (
                  <p className="text-sm text-amber-800 bg-amber-50 rounded px-2 py-1 mb-2">
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
                        className="h-16 w-16 object-cover rounded border"
                      />
                    ))}
                  </div>
                )}

                {tab === 'pending_manual' && (
                  <p className="text-xs text-gray-500 mt-2">
                    Підтвердіть у Telegram-групі модерації (кнопки ✅/❌)
                  </p>
                )}
                {tab === 'channel_pending' && (
                  <p className="text-xs text-gray-500 mt-2">
                    На маркетплейсі вже є — для каналу натисніть «✅ У канал» у Telegram
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

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        accent ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
      }`}
    >
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-emerald-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
