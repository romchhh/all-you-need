'use client';

import { useEffect, useState } from 'react';

export default function CreateTestListingPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [data, setData] = useState<{
    user?: { id: number; telegramId: string; firstName: string | null; lastName: string | null; avatar: string | null };
    listingsCount?: number;
    listings?: Array<{ id: number; title: string; status: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    const url = '/api/test/create-test-data';
    fetch(url)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) return res.json().then((body) => Promise.reject(new Error(body?.error || res.statusText)));
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setStatus('ok');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Помилка запиту');
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center">
      <h1 className="text-xl font-semibold mb-4">Тестові дані</h1>

      {status === 'loading' && (
        <p className="text-white/70">Створюємо тестового користувача та 10 оголошень…</p>
      )}

      {status === 'ok' && data && (
        <div className="space-y-4 text-left max-w-md w-full">
          <p className="text-[#D3F1A7] font-medium">Готово.</p>
          <p>
            Користувач: <strong>{data.user?.firstName} {data.user?.lastName}</strong> (telegramId: {data.user?.telegramId})
          </p>
          {data.user?.avatar && (
            <p className="text-sm text-white/70">Аватар: {data.user.avatar}</p>
          )}
          <p>Оголошень створено: <strong>{data.listingsCount ?? 0}</strong></p>
          {data.listings && data.listings.length > 0 && (
            <ul className="text-sm text-white/70 list-disc list-inside space-y-1">
              {data.listings.slice(0, 5).map((l) => (
                <li key={l.id}>{l.title}</li>
              ))}
              {data.listings.length > 5 && <li>… та ще {data.listings.length - 5}</li>}
            </ul>
          )}
        </div>
      )}

      {status === 'error' && (
        <p className="text-red-400">{error}</p>
      )}

      <p className="mt-8 text-white/50 text-sm">
        Сторінка для створення тестових даних.
      </p>
    </div>
  );
}
