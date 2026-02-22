'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SimpleChart from '@/components/admin/SimpleChart';

interface Stats {
  users: {
    total: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
    online: number;
    activeToday: number;
    activeYesterday: number;
    activeWeek: number;
  };
  listings: {
    total: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
    byStatus: Record<string, number>;
  };
}

interface DetailedStats {
  charts: {
    newUsers: Array<{ date: string; count: number }>;
    newListings: Array<{ date: string; count: number }>;
    activeUsers: Array<{ date: string; count: number }>;
  };
  categories: Array<{ category: string; count: number }>;
  topListings: Array<{ id: number; title: string; views: number; status: string; createdAt: string; seller: string }>;
  topUsers: Array<{ id: number; name: string; username: string | null; avatar: string | null; telegramId: string; listingsCount: number; totalViews: number }>;
}

interface CityCount {
  city: string;
  count: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null);
  const [listingsByCity, setListingsByCity] = useState<CityCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
    fetchDetailedStats();
    fetchListingsByCity();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError('Помилка завантаження статистики');
      }
    } catch (err) {
      setError('Помилка підключення до сервера');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedStats = async () => {
    try {
      const response = await fetch('/api/admin/stats/detailed');
      if (response.ok) {
        const data = await response.json();
        setDetailedStats(data);
      }
    } catch (err) {
      // Ігноруємо помилки детальної статистики
    }
  };

  const fetchListingsByCity = async () => {
    try {
      const response = await fetch('/api/admin/stats/listings-by-city');
      if (response.ok) {
        const data = await response.json();
        setListingsByCity(data.cities || []);
      }
    } catch (err) {
      // Ігноруємо
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-900">Завантаження...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm sm:text-base">
        {error}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const StatCard = ({
    title,
    value,
    subtitle,
    icon,
  }: {
    title: string;
    value: number | string;
    subtitle?: string;
    icon: string;
  }) => (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 hover:shadow-lg transition-shadow w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
            {title}
          </p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mt-1 sm:mt-2">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-900 mt-1 truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className="text-3xl sm:text-4xl lg:text-5xl ml-2 sm:ml-3 flex-shrink-0">{icon}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="px-0 sm:px-2">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
          Статистика
        </h1>
        <p className="text-sm sm:text-base text-gray-900 mt-1 sm:mt-2">
          Огляд системи та активності користувачів
        </p>
      </div>

      {/* Користувачі */}
      <div className="px-0 sm:px-2">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Користувачі
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Всього користувачів"
            value={stats.users.total.toLocaleString()}
            icon="👥"
          />
          <StatCard
            title="Онлайн"
            value={stats.users.online.toLocaleString()}
            subtitle="за останню годину"
            icon="🟢"
          />
          <StatCard
            title="Нових сьогодні"
            value={stats.users.newToday.toLocaleString()}
            icon="📅"
          />
          <StatCard
            title="Нових за тиждень"
            value={stats.users.newWeek.toLocaleString()}
            icon="📆"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
          <StatCard
            title="Нових за місяць"
            value={stats.users.newMonth.toLocaleString()}
            icon="🗓️"
          />
          <StatCard
            title="Активних сьогодні"
            value={stats.users.activeToday.toLocaleString()}
            icon="👤"
          />
          <StatCard
            title="Активних вчора"
            value={stats.users.activeYesterday.toLocaleString()}
            icon="👥"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <StatCard
              title="Активних за тиждень"
              value={stats.users.activeWeek.toLocaleString()}
              icon="📊"
            />
          </div>
        </div>
      </div>

      {/* Оголошення */}
      <div className="px-0 sm:px-2">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Оголошення
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Всього оголошень"
            value={stats.listings.total.toLocaleString()}
            icon="📋"
          />
          <StatCard
            title="Нових сьогодні"
            value={stats.listings.newToday.toLocaleString()}
            icon="📅"
          />
          <StatCard
            title="Нових за тиждень"
            value={stats.listings.newWeek.toLocaleString()}
            icon="📆"
          />
          <StatCard
            title="Нових за місяць"
            value={stats.listings.newMonth.toLocaleString()}
            icon="🗓️"
          />
        </div>
        <div className="mt-4 sm:mt-6">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">
            По статусах
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
            {Object.entries(stats.listings.byStatus).map(([status, count]) => (
              <div
                key={status}
                className="bg-white rounded-lg shadow-md p-3 sm:p-4 cursor-pointer hover:shadow-lg transition-shadow min-w-0"
                onClick={() => router.push(`/admin/listings?status=${status}`)}
              >
                <p className="text-xs sm:text-sm font-medium text-gray-900 capitalize truncate">
                  {status}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                  {Number(count).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Топ 20 міст за кількістю оголошень */}
        {listingsByCity.length > 0 && (
          <div className="mt-4 sm:mt-6">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">
              Оголошення по містах (топ 20)
            </h3>
            <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 overflow-x-auto">
              <table className="w-full min-w-[280px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-900 uppercase">#</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-900 uppercase">Місто</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-900 uppercase">Оголошень</th>
                  </tr>
                </thead>
                <tbody>
                  {listingsByCity.map((row, idx) => (
                    <tr key={row.city} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2 text-sm text-gray-600">{idx + 1}</td>
                      <td className="py-2 px-2 text-sm font-medium text-gray-900">{row.city}</td>
                      <td className="py-2 px-2 text-sm text-gray-900 text-right font-semibold">{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Швидкі дії */}
      <div className="px-0 sm:px-2">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Швидкі дії
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <button
            onClick={() => router.push('/admin/listings/moderation')}
            className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg shadow-md p-4 sm:p-6 text-left transition-colors w-full"
          >
            <div className="text-2xl sm:text-3xl mb-2">⏳</div>
            <div className="text-base sm:text-lg font-semibold">На модерації</div>
            <div className="text-xs sm:text-sm opacity-90 mt-1">
              {stats.listings.byStatus.pending || 0} оголошень
            </div>
          </button>
          <button
            onClick={() => router.push('/admin/users')}
            className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-md p-4 sm:p-6 text-left transition-colors w-full"
          >
            <div className="text-2xl sm:text-3xl mb-2">👥</div>
            <div className="text-base sm:text-lg font-semibold">Користувачі</div>
            <div className="text-xs sm:text-sm opacity-90 mt-1">
              {stats.users.total} зареєстровано
            </div>
          </button>
          <button
            onClick={() => router.push('/admin/listings')}
            className="bg-green-500 hover:bg-green-600 text-white rounded-lg shadow-md p-4 sm:p-6 text-left transition-colors w-full sm:col-span-2 lg:col-span-1"
          >
            <div className="text-2xl sm:text-3xl mb-2">📋</div>
            <div className="text-base sm:text-lg font-semibold">Всі оголошення</div>
            <div className="text-xs sm:text-sm opacity-90 mt-1">
              {stats.listings.total} оголошень
            </div>
          </button>
        </div>
      </div>

      {/* Графіки */}
      {detailedStats && (
        <div className="px-0 sm:px-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            Графіки активності (останні 30 днів)
          </h2>
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="w-full lg:w-[70%]">
              <SimpleChart
                data={detailedStats.charts.newUsers}
                title="Нові користувачі"
                color="#4F46E5"
              />
            </div>
            <div className="w-full lg:w-[70%]">
              <SimpleChart
                data={detailedStats.charts.newListings}
                title="Нові оголошення"
                color="#10B981"
              />
            </div>
            <div className="w-full lg:w-[70%]">
              <SimpleChart
                data={detailedStats.charts.activeUsers}
                title="Активні користувачі"
                color="#F59E0B"
              />
            </div>
          </div>
        </div>
      )}

      {/* Статистика по категоріях */}
      {detailedStats && detailedStats.categories.length > 0 && (
        <div className="px-0 sm:px-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            Статистика по категоріях
          </h2>
          <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 lg:p-6">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 min-w-0">
                {detailedStats.categories.map((item) => (
                  <div
                    key={item.category}
                    className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg min-w-0"
                  >
                    <span className="text-gray-900 font-medium text-xs sm:text-sm truncate flex-1 mr-2">
                      {item.category}
                    </span>
                    <span className="text-indigo-600 font-bold text-sm sm:text-base flex-shrink-0">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Топ оголошення */}
      {detailedStats && detailedStats.topListings.length > 0 && (
        <div className="px-0 sm:px-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            Топ оголошення за переглядами
          </h2>
          
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-lg shadow-md w-full">
            <div className="overflow-x-auto overscroll-x-contain w-full" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap sticky left-0 bg-gray-50 z-20 border-r border-gray-200 min-w-[200px]">
                      Назва
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[150px]">
                      Продавець
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[100px]">
                      Перегляди
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[100px]">
                      Статус
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[120px] sticky right-0 bg-gray-50 z-20 border-l border-gray-200">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {detailedStats.topListings.map((listing) => (
                    <tr key={listing.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 text-sm text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200 min-w-[200px]">
                        <div className="max-w-[200px] truncate" title={listing.title}>{listing.title}</div>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 min-w-[150px]">
                        <div className="truncate max-w-[150px]" title={listing.seller}>{listing.seller}</div>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 whitespace-nowrap min-w-[100px]">
                        {listing.views.toLocaleString()}
                      </td>
                      <td className="px-3 py-4 text-sm min-w-[100px]">
                        <span
                          className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                            listing.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : listing.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm font-medium min-w-[120px] sticky right-0 bg-white z-10 border-l border-gray-200">
                        <button
                          onClick={() => router.push(`/admin/listings/${listing.id}`)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors whitespace-nowrap text-xs"
                        >
                          Переглянути
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {detailedStats.topListings.map((listing) => (
              <div key={listing.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 break-words">{listing.title}</h3>
                    <div className="space-y-1 text-xs text-gray-900">
                      <p><span className="font-medium">Продавець:</span> {listing.seller}</p>
                      <p><span className="font-medium">Перегляди:</span> {listing.views.toLocaleString()}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap flex-shrink-0 ${
                      listing.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : listing.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {listing.status}
                  </span>
                </div>
                <button
                  onClick={() => router.push(`/admin/listings/${listing.id}`)}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                  Переглянути
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Топ користувачі */}
      {detailedStats && detailedStats.topUsers.length > 0 && (
        <div className="px-0 sm:px-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            Топ користувачі за кількістю оголошень
          </h2>
          
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-lg shadow-md w-full">
            <div className="overflow-x-auto overscroll-x-contain w-full" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap sticky left-0 bg-gray-50 z-20 border-r border-gray-200 min-w-[220px]">
                      Користувач
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[120px]">
                      Оголошень
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[140px]">
                      Переглядів
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[120px] sticky right-0 bg-gray-50 z-20 border-l border-gray-200">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {detailedStats.topUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 sticky left-0 bg-white z-10 border-r border-gray-200 min-w-[220px]">
                        <div className="flex items-center">
                          {user.avatar ? (
                            <img
                              src={user.avatar.startsWith('http') ? user.avatar : user.avatar}
                              alt={user.name}
                              className="h-10 w-10 rounded-full mr-3 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                  (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          {!user.avatar && (
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center mr-3 flex-shrink-0">
                              <span className="text-gray-900 text-sm">
                                {user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {user.name}
                            </div>
                            {user.username && (
                              <div className="text-xs text-gray-900 truncate">
                                @{user.username}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 whitespace-nowrap min-w-[120px]">
                        {user.listingsCount}
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 whitespace-nowrap min-w-[140px]">
                        {user.totalViews.toLocaleString()}
                      </td>
                      <td className="px-3 py-4 text-sm font-medium min-w-[120px] sticky right-0 bg-white z-10 border-l border-gray-200">
                        <button
                          onClick={() => router.push(`/admin/users/${user.id}`)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors whitespace-nowrap text-xs"
                        >
                          Переглянути
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {detailedStats.topUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {user.avatar ? (
                    <img
                      src={user.avatar.startsWith('http') ? user.avatar : user.avatar}
                      alt={user.name}
                      className="h-12 w-12 rounded-full flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  {!user.avatar && (
                    <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-900 text-base font-medium">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{user.name}</h3>
                    {user.username && (
                      <p className="text-xs text-gray-900 truncate">@{user.username}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-900">
                      <div>
                        <span className="font-medium">Оголошень:</span> {user.listingsCount}
                      </div>
                      <div>
                        <span className="font-medium">Переглядів:</span> {user.totalViews.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                  Переглянути профіль
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
