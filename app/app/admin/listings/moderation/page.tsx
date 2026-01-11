'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Listing {
  id: number;
  userId: number;
  title: string;
  description: string;
  price: string;
  currency: string | null;
  isFree: boolean;
  category: string;
  subcategory: string | null;
  condition: string | null;
  location: string;
  views: number;
  status: string;
  images: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  seller: {
    id: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    telegramId: string;
  };
  favoritesCount: number;
}

export default function AdminModerationPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('status', 'pending');
      params.set('limit', '100');

      const response = await fetch(`/api/admin/listings?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings);
      } else {
        setError('Помилка завантаження оголошень на модерації');
      }
    } catch (err) {
      setError('Помилка підключення до сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleView = (id: number) => {
    router.push(`/admin/listings/${id}`);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Ви впевнені, що хочете видалити це оголошення?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/listings?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchListings();
      } else {
        alert('Помилка видалення оголошення');
      }
    } catch (err) {
      alert('Помилка підключення до сервера');
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/listings/${id}/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchListings();
      } else {
        alert('Помилка зміни статусу');
      }
    } catch (err) {
      alert('Помилка підключення до сервера');
    }
  };

  if (loading) {
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
          Оголошення на модерації
        </h1>
        <p className="text-sm sm:text-base text-gray-900 mt-1 sm:mt-2">
          Оголошення, які потребують перевірки
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm sm:text-base">
          {error}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 text-center">
          <p className="text-gray-900 text-sm sm:text-base">
            Немає оголошень на модерації
          </p>
        </div>
      ) : (
        <>
          {/* Moderation Table - Desktop */}
          <div className="bg-white rounded-lg shadow-md hidden lg:block w-full">
            <div className="overflow-x-auto overscroll-x-contain w-full" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
              <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 z-20 border-r border-gray-200 min-w-[80px]">
                    ID
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[200px]">
                    Назва
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[150px]">
                    Користувач
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                    Категорія
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                    Ціна
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[130px]">
                    Дата створення
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[440px] sticky right-0 bg-gray-50 z-20 border-l border-gray-200">
                    Дії
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {listings.map((listing) => (
                  <tr key={listing.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-medium sticky left-0 bg-white z-10 border-r border-gray-200 min-w-[80px]">
                      {listing.id}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-900 min-w-[200px]">
                      <div className="max-w-[200px] truncate" title={listing.title}>{listing.title}</div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[150px]">
                      <div className="truncate max-w-[150px]" title={listing.seller.firstName || listing.seller.username || 'Користувач'}>
                        {listing.seller.firstName || listing.seller.username || 'Користувач'}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[140px]">
                      <div className="truncate max-w-[140px]" title={listing.category}>{listing.category}</div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[120px]">
                      {listing.isFree ? 'Безкоштовно' : `${listing.price} ${listing.currency || ''}`}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[130px]">
                      {new Date(listing.createdAt).toLocaleDateString('uk-UA')}
                    </td>
                    <td className="px-3 py-4 text-sm font-medium min-w-[440px] sticky right-0 bg-white z-10 border-l border-gray-200">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleStatusChange(listing.id, 'approved')}
                          className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                          title="Схвалити"
                        >
                          ✓ Схвалити
                        </button>
                        <button
                          onClick={() => handleStatusChange(listing.id, 'active')}
                          className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                          title="Активувати"
                        >
                          ▶ Активувати
                        </button>
                        <button
                          onClick={() => handleView(listing.id)}
                          className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                        >
                          Переглянути
                        </button>
                        <button
                          onClick={() => handleStatusChange(listing.id, 'rejected')}
                          className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                          title="Відхилити"
                        >
                          ✗ Відхилити
                        </button>
                        <button
                          onClick={() => handleDelete(listing.id)}
                          className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                        >
                          Видалити
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>

        {/* Moderation Cards - Mobile */}
        <div className="lg:hidden space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-900">ID: {listing.id}</span>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap">
                      pending
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 break-words">{listing.title}</h3>
                  <div className="space-y-1 text-xs text-gray-900">
                    <p><span className="font-medium">Користувач:</span> {listing.seller.firstName || listing.seller.username || 'Користувач'}</p>
                    <p><span className="font-medium">Категорія:</span> {listing.category}</p>
                    <p><span className="font-medium">Ціна:</span> {listing.isFree ? 'Безкоштовно' : `${listing.price} ${listing.currency || ''}`}</p>
                    <p><span className="font-medium">Дата:</span> {new Date(listing.createdAt).toLocaleDateString('uk-UA')}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-200">
                <button
                  onClick={() => handleStatusChange(listing.id, 'approved')}
                  className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors text-xs font-medium"
                >
                  ✓ Схвалити
                </button>
                <button
                  onClick={() => handleStatusChange(listing.id, 'active')}
                  className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-xs font-medium"
                >
                  ▶ Активувати
                </button>
                <button
                  onClick={() => handleView(listing.id)}
                  className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors text-xs font-medium"
                >
                  Переглянути
                </button>
                <button
                  onClick={() => handleStatusChange(listing.id, 'rejected')}
                  className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition-colors text-xs font-medium"
                >
                  ✗ Відхилити
                </button>
                <button
                  onClick={() => handleDelete(listing.id)}
                  className="col-span-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors text-xs font-medium"
                >
                  Видалити
                </button>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
