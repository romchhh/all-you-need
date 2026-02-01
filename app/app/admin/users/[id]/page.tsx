'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface User {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  phone: string | null;
  avatar: string | null;
  balance: number;
  rating: number;
  reviewsCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  stats: {
    listingsCount: number;
    activeListingsCount: number;
    pendingListingsCount: number;
    soldListingsCount: number;
    totalViews: number;
    favoritesCount: number;
  };
  recentListings: Array<{
    id: number;
    title: string;
    status: string;
    views: number;
    createdAt: string;
  }>;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchUser();
    }
  }, [id]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/users/${id}`);
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      } else {
        setError('Помилка завантаження користувача');
      }
    } catch (err) {
      setError('Помилка підключення до сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!user) return;

    if (!confirm(`Ви впевнені, що хочете ${user.isActive ? 'заблокувати' : 'розблокувати'} цього користувача?`)) {
      return;
    }

    try {
      setUpdating(true);
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (response.ok) {
        fetchUser();
      } else {
        alert('Помилка зміни статусу користувача');
      }
    } catch (err) {
      alert('Помилка підключення до сервера');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    if (!confirm('Видалити користувача з бази? Він зможе пройти реєстрацію заново. Всі оголошення та дані будуть видалені.')) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });

      if (response.ok) {
        router.push('/admin/users');
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Помилка видалення користувача');
      }
    } catch (err) {
      alert('Помилка підключення до сервера');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-900">Завантаження...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
        {error || 'Користувач не знайдено'}
      </div>
    );
  }

  const StatCard = ({
    title,
    value,
    subtitle,
  }: {
    title: string;
    value: number | string;
    subtitle?: string;
  }) => (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 hover:shadow-lg transition-shadow">
      <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{title}</p>
      <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">{value}</p>
      {subtitle && (
        <p className="text-xs text-gray-900 mt-1 truncate">{subtitle}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => router.back()}
            className="text-indigo-600 hover:text-indigo-900 mb-3 sm:mb-4 text-sm sm:text-base transition-colors"
          >
            ← Назад
          </button>
          <div className="flex items-center gap-3 sm:gap-4">
            {user.avatar ? (
              <img
                src={user.avatar.startsWith('http') ? user.avatar : user.avatar}
                alt={user.fullName}
                className="h-12 w-12 sm:h-16 sm:w-16 rounded-full flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextElementSibling) {
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
            ) : null}
            {!user.avatar && (
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                <span className="text-xl sm:text-2xl text-gray-900">
                  {user.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 break-words">
                {user.fullName}
              </h1>
              {user.username && (
                <p className="text-xs sm:text-sm text-gray-900 mt-1 break-words">@{user.username}</p>
              )}
              <p className="text-xs sm:text-sm text-gray-900 mt-1 break-words">
                ID: {user.id} • Telegram ID: {user.telegramId}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleToggleStatus}
            disabled={updating || deleting}
            className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-md transition-colors text-sm sm:text-base ${
              user.isActive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {updating ? 'Обробка...' : user.isActive ? 'Заблокувати' : 'Розблокувати'}
          </button>
          <button
            onClick={handleDeleteUser}
            disabled={updating || deleting}
            className="w-full sm:w-auto px-3 sm:px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-900 text-white transition-colors text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Видалення...' : 'Видалити користувача'}
          </button>
        </div>
      </div>

      {/* Основна інформація */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Рейтинг"
          value={user.rating.toFixed(1)}
          subtitle={`${user.reviewsCount} відгуків`}
        />
        <StatCard
          title="Баланс"
          value={`${user.balance.toFixed(2)} EUR`}
        />
        <StatCard
          title="Статус"
          value={user.isActive ? 'Активний' : 'Заблокований'}
        />
        <StatCard
          title="Остання активність"
          value={user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString('uk-UA') : 'Ніколи'}
        />
      </div>

      {/* Контактна інформація */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Контактна інформація
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <dt className="text-xs sm:text-sm font-medium text-gray-900">Ім'я</dt>
            <dd className="text-sm sm:text-base text-gray-900 mt-1 break-words">
              {user.firstName || 'Не вказано'}
            </dd>
          </div>
          <div>
            <dt className="text-xs sm:text-sm font-medium text-gray-900">Прізвище</dt>
            <dd className="text-sm sm:text-base text-gray-900 mt-1 break-words">
              {user.lastName || 'Не вказано'}
            </dd>
          </div>
          <div>
            <dt className="text-xs sm:text-sm font-medium text-gray-900">Телефон</dt>
            <dd className="text-sm sm:text-base text-gray-900 mt-1 break-words">
              {user.phone || 'Не вказано'}
            </dd>
          </div>
          <div>
            <dt className="text-xs sm:text-sm font-medium text-gray-900">Дата реєстрації</dt>
            <dd className="text-sm sm:text-base text-gray-900 mt-1">
              {new Date(user.createdAt).toLocaleString('uk-UA')}
            </dd>
          </div>
        </dl>
      </div>

      {/* Статистика оголошень */}
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Статистика оголошень
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            title="Всього оголошень"
            value={user.stats.listingsCount}
          />
          <StatCard
            title="Активних"
            value={user.stats.activeListingsCount}
          />
          <StatCard
            title="На модерації"
            value={user.stats.pendingListingsCount}
          />
          <StatCard
            title="Проданих"
            value={user.stats.soldListingsCount}
          />
          <StatCard
            title="Переглядів"
            value={user.stats.totalViews.toLocaleString()}
          />
          <StatCard
            title="В обраному"
            value={user.stats.favoritesCount}
          />
        </div>
      </div>

      {/* Останні оголошення */}
      {user.recentListings && user.recentListings.length > 0 && (
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            Останні оголошення
          </h2>
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap sticky left-0 bg-gray-50 z-10 min-w-[200px]">
                      Назва
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[100px]">
                      Статус
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[100px]">
                      Перегляди
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[120px]">
                      Дата створення
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 uppercase whitespace-nowrap min-w-[120px] sticky right-0 bg-gray-50 z-10">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {user.recentListings.map((listing) => (
                    <tr key={listing.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-900 sticky left-0 bg-white z-10 min-w-[200px]">
                        <div className="max-w-[200px] truncate" title={listing.title}>{listing.title}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap min-w-[100px]">
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
                      <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap min-w-[100px]">
                        {listing.views}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap min-w-[120px]">
                        {new Date(listing.createdAt).toLocaleDateString('uk-UA')}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium min-w-[120px] sticky right-0 bg-white z-10">
                        <button
                          onClick={() => router.push(`/admin/listings/${listing.id}`)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors whitespace-nowrap"
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
        </div>
      )}

      {/* Перегляд всіх оголошень користувача */}
      <div>
        <button
          onClick={() => router.push(`/admin/listings?userId=${user.id}`)}
          className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm sm:text-base"
        >
          Переглянути всі оголошення користувача
        </button>
      </div>
    </div>
  );
}
