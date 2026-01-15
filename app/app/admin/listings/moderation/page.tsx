'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Stats {
  marketplace: number;
  total: number;
}

export default function ModerationPage() {
  const [stats, setStats] = useState<Stats>({ marketplace: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const marketplaceRes = await fetch('/api/admin/moderation/marketplace?status=pending');
      let marketplaceCount = 0;

      // Обробка результату маркетплейсу
      if (marketplaceRes.ok) {
        try {
          const marketplaceData = await marketplaceRes.json();
          marketplaceCount = marketplaceData.total || 0;
        } catch (error) {
          console.error('Error parsing marketplace data:', error);
        }
      } else {
        console.error('Marketplace API error: Request failed');
      }

      setStats({
        marketplace: marketplaceCount,
        total: marketplaceCount,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Встановлюємо нульові значення при помилці
      setStats({
        marketplace: 0,
        total: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Модерація оголошень</h1>
        <p className="text-gray-600">Всього оголошень на модерації: {stats.total}</p>
      </div>

      {stats.total === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Немає оголошень на модерації
          </h2>
          <p className="text-gray-600">Всі оголошення перевірено</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Маркетплейс */}
          <Link
            href="/admin/listings/moderation/marketplace"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-5xl">🌐</div>
              <div className="text-right">
                <div className="text-4xl font-bold text-blue-600">{stats.marketplace}</div>
                <div className="text-sm text-gray-500">оголошень</div>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Маркетплейс</h2>
            <p className="text-gray-600 mb-4">
              Оголошення, створені через веб-додаток
            </p>
            <div className="text-blue-600 font-medium">
              Перейти до модерації →
            </div>
          </Link>
        </div>
      )}

      {/* Статистика */}
      <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Статистика</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Всього</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.marketplace}</div>
            <div className="text-sm text-gray-500">Маркетплейс</div>
          </div>
        </div>
      </div>
    </div>
  );
}
