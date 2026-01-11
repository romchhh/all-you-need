'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
    phone: string | null;
    telegramId: string;
  };
  favoritesCount: number;
}

export default function AdminListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      fetchListing();
    }
  }, [id]);

  const fetchListing = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/listings/${id}`);
      if (response.ok) {
        const data = await response.json();
        setListing(data);
      } else {
        setError('Помилка завантаження оголошення');
      }
    } catch (err) {
      setError('Помилка підключення до сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Ви впевнені, що хочете видалити це оголошення?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/listings?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/listings');
      } else {
        alert('Помилка видалення оголошення');
      }
    } catch (err) {
      alert('Помилка підключення до сервера');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/listings/${id}/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchListing();
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

  if (error || !listing) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
        {error || 'Оголошення не знайдено'}
      </div>
    );
  }

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
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 break-words">
            {listing.title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-900 mt-1 sm:mt-2">
            ID: {listing.id} • Статус: <span className="font-semibold">{listing.status}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <select
            value={listing.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
          >
            <option value="pending">На модерації</option>
            <option value="approved">Схвалено</option>
            <option value="rejected">Відхилено</option>
            <option value="active">Активне</option>
            <option value="sold">Продано</option>
            <option value="expired">Прострочено</option>
            <option value="hidden">Приховано</option>
          </select>
          <button
            onClick={handleDelete}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm sm:text-base"
          >
            Видалити
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Images */}
          {listing.images && listing.images.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
                Зображення
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {listing.images.map((image, index) => (
                  <img
                    key={index}
                    src={image.startsWith('http') ? image : image}
                    alt={`${listing.title} ${index + 1}`}
                    className="w-full h-32 sm:h-48 object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder.png';
                      e.currentTarget.alt = 'Зображення недоступне';
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
              Опис
            </h2>
            <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap break-words">
              {listing.description}
            </p>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Details */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
              Деталі
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs sm:text-sm font-medium text-gray-900">
                  Ціна
                </dt>
                <dd className="text-base sm:text-lg font-semibold text-gray-900 mt-1">
                  {listing.isFree
                    ? 'Безкоштовно'
                    : `${listing.price} ${listing.currency || ''}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs sm:text-sm font-medium text-gray-900">
                  Категорія
                </dt>
                <dd className="text-sm sm:text-base text-gray-900 mt-1">
                  {listing.category}
                  {listing.subcategory && ` • ${listing.subcategory}`}
                </dd>
              </div>
              {listing.condition && (
                <div>
                  <dt className="text-xs sm:text-sm font-medium text-gray-900">
                    Стан
                  </dt>
                  <dd className="text-sm sm:text-base text-gray-900 mt-1">
                    {listing.condition}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs sm:text-sm font-medium text-gray-900">
                  Локація
                </dt>
                <dd className="text-sm sm:text-base text-gray-900 mt-1 break-words">
                  {listing.location}
                </dd>
              </div>
              <div>
                <dt className="text-xs sm:text-sm font-medium text-gray-900">
                  Перегляди
                </dt>
                <dd className="text-sm sm:text-base text-gray-900 mt-1">
                  {listing.views}
                </dd>
              </div>
              <div>
                <dt className="text-xs sm:text-sm font-medium text-gray-900">
                  В обраному
                </dt>
                <dd className="text-sm sm:text-base text-gray-900 mt-1">
                  {listing.favoritesCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs sm:text-sm font-medium text-gray-900">
                  Дата створення
                </dt>
                <dd className="text-sm sm:text-base text-gray-900 mt-1">
                  {new Date(listing.createdAt).toLocaleString('uk-UA')}
                </dd>
              </div>
              {listing.publishedAt && (
                <div>
                  <dt className="text-xs sm:text-sm font-medium text-gray-900">
                    Дата публікації
                  </dt>
                  <dd className="text-sm sm:text-base text-gray-900 mt-1">
                    {new Date(listing.publishedAt).toLocaleString('uk-UA')}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Seller */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
              Продавець
            </h2>
            <div className="space-y-2">
              <p className="text-sm sm:text-base text-gray-900 font-medium break-words">
                {listing.seller.firstName && listing.seller.lastName
                  ? `${listing.seller.firstName} ${listing.seller.lastName}`
                  : listing.seller.firstName ||
                    listing.seller.username ||
                    'Користувач'}
              </p>
              {listing.seller.username && (
                <p className="text-xs sm:text-sm text-gray-900 break-words">
                  @{listing.seller.username}
                </p>
              )}
              {listing.seller.phone && (
                <p className="text-xs sm:text-sm text-gray-900 break-words">
                  {listing.seller.phone}
                </p>
              )}
              {listing.seller.telegramId && (
                <p className="text-xs sm:text-sm text-gray-900 break-words">
                  Telegram ID: {listing.seller.telegramId}
                </p>
              )}
              <button
                onClick={() => router.push(`/admin/users/${listing.userId}`)}
                className="mt-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-xs sm:text-sm"
              >
                Переглянути профіль
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
