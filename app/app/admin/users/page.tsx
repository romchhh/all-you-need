'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  avatar: string | null;
  balance: number;
  rating: number;
  reviewsCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  listingsCount: number;
  activeListingsCount: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filters
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [activeFromFilter, setActiveFromFilter] = useState('');
  const [activeToFilter, setActiveToFilter] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFromFilter) params.set('dateFrom', dateFromFilter);
      if (dateToFilter) params.set('dateTo', dateToFilter);
      if (activeFromFilter) params.set('activeFrom', activeFromFilter);
      if (activeToFilter) params.set('activeTo', activeToFilter);
      params.set('limit', limit.toString());
      params.set('offset', ((page - 1) * limit).toString());

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotal(data.total);
      } else {
        setError('Помилка завантаження користувачів');
      }
    } catch (err) {
      setError('Помилка підключення до сервера');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, dateFromFilter, dateToFilter, activeFromFilter, activeToFilter]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchUsers();
  };

  const handleResetFilters = () => {
    setDateFromFilter('');
    setDateToFilter('');
    setActiveFromFilter('');
    setActiveToFilter('');
    setPage(1);
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-900">Завантаження...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Користувачі
        </h1>
        <p className="text-sm sm:text-base text-gray-900 mt-1 sm:mt-2">
          Управління користувачами системи
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
          Фільтри
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Дата реєстрації від
            </label>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Дата реєстрації до
            </label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Активність від
            </label>
            <input
              type="date"
              value={activeFromFilter}
              onChange={(e) => setActiveFromFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Активність до
            </label>
            <input
              type="date"
              value={activeToFilter}
              onChange={(e) => setActiveToFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3 sm:mt-4">
          <button
            onClick={handleApplyFilters}
            className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm sm:text-base"
          >
            Застосувати
          </button>
          <button
            onClick={handleResetFilters}
            className="px-3 sm:px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm sm:text-base"
          >
            Скинути
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm sm:text-base">
          {error}
        </div>
      )}

      {/* Users Table - Desktop */}
      <div className="bg-white rounded-lg shadow-md hidden lg:block w-full">
        <div className="overflow-x-auto overscroll-x-contain w-full" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 z-20 border-r border-gray-200 min-w-[80px]">
                  ID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[220px]">
                  Користувач
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                  Telegram ID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                  Рейтинг
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                  Оголошень
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[130px]">
                  Дата реєстрації
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                  Остання активність
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[120px] sticky right-0 bg-gray-50 z-20 border-l border-gray-200">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-medium sticky left-0 bg-white z-10 border-r border-gray-200 min-w-[80px]">
                    {user.id}
                  </td>
                  <td className="px-3 py-4 min-w-[220px]">
                    <div className="flex items-center">
                      {user.avatar ? (
                        <img
                          src={user.avatar.startsWith('http') ? user.avatar : user.avatar}
                          alt={user.fullName}
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
                            {user.fullName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {user.fullName}
                        </div>
                        {user.username && (
                          <div className="text-xs text-gray-900 truncate">
                            @{user.username}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[140px]">
                    <div className="truncate max-w-[140px]" title={user.telegramId}>{user.telegramId}</div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[120px]">
                    {user.rating.toFixed(1)} ({user.reviewsCount})
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[120px]">
                    {user.activeListingsCount} / {user.listingsCount}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[130px]">
                    {new Date(user.createdAt).toLocaleDateString('uk-UA')}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[140px]">
                    {user.lastActiveAt
                      ? new Date(user.lastActiveAt).toLocaleDateString('uk-UA')
                      : 'Ніколи'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium min-w-[120px] sticky right-0 bg-white z-10 border-l border-gray-200">
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

      {/* Users Cards - Mobile */}
      <div className="lg:hidden space-y-3">
        {users.map((user) => (
          <div key={user.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {user.avatar ? (
                  <img
                    src={user.avatar.startsWith('http') ? user.avatar : user.avatar}
                    alt={user.fullName}
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
                      {user.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-900">ID: {user.id}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{user.fullName}</h3>
                  {user.username && (
                    <p className="text-xs text-gray-900 truncate">@{user.username}</p>
                  )}
                  <p className="text-xs text-gray-900 truncate">Telegram: {user.telegramId}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-900 border-t border-gray-200 pt-3">
              <div>
                <span className="font-medium">Рейтинг:</span> {user.rating.toFixed(1)} ({user.reviewsCount})
              </div>
              <div>
                <span className="font-medium">Оголошень:</span> {user.activeListingsCount} / {user.listingsCount}
              </div>
              <div>
                <span className="font-medium">Реєстрація:</span> {new Date(user.createdAt).toLocaleDateString('uk-UA')}
              </div>
              <div>
                <span className="font-medium">Активність:</span> {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString('uk-UA') : 'Ніколи'}
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <button
                onClick={() => router.push(`/admin/users/${user.id}`)}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Переглянути профіль
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination - Desktop */}
      {total > limit && (
        <div className="hidden lg:flex bg-gray-50 px-4 py-3 flex-row items-center justify-between border-t border-gray-200 rounded-lg mt-3">
          <div className="text-sm text-gray-900">
            Показано {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} з {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors text-sm"
            >
              Назад
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total}
              className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors text-sm"
            >
              Вперед
            </button>
          </div>
        </div>
      )}

      {/* Pagination - Mobile */}
      {total > limit && (
        <div className="lg:hidden bg-gray-50 px-4 py-3 flex flex-col items-center justify-between gap-3 border-t border-gray-200 rounded-lg mt-3">
          <div className="text-sm text-gray-900">
            Показано {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} з {total}
          </div>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Назад
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Вперед
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
