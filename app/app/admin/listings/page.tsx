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

export default function AdminListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  const fetchListings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFromFilter) params.set('dateFrom', dateFromFilter);
      if (dateToFilter) params.set('dateTo', dateToFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchFilter) params.set('search', searchFilter);
      params.set('limit', limit.toString());
      params.set('offset', ((page - 1) * limit).toString());

      const response = await fetch(`/api/admin/listings?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings);
        setTotal(data.total);
      } else {
        setError('Помилка завантаження оголошень');
      }
    } catch (err) {
      setError('Помилка підключення до сервера');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [page, statusFilter, dateFromFilter, dateToFilter, categoryFilter, searchFilter]);

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

  const handleView = (id: number) => {
    router.push(`/admin/listings/${id}`);
  };

  const handleApplyFilters = () => {
    setPage(1);
    fetchListings();
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setDateFromFilter('');
    setDateToFilter('');
    setCategoryFilter('all');
    setSearchFilter('');
    setPage(1);
    setSelectedIds(new Set());
    setShowBulkActions(false);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === listings.length) {
      setSelectedIds(new Set());
      setShowBulkActions(false);
    } else {
      setSelectedIds(new Set(listings.map((l) => l.id)));
      setShowBulkActions(true);
    }
  };

  const handleSelectListing = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Ви впевнені, що хочете видалити ${selectedIds.size} оголошень?`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedIds).map((id) =>
        fetch(`/api/admin/listings?id=${id}`, { method: 'DELETE' })
      );

      await Promise.all(deletePromises);
      setSelectedIds(new Set());
      setShowBulkActions(false);
      fetchListings();
    } catch (err) {
      alert('Помилка видалення оголошень');
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Змінити статус ${selectedIds.size} оголошень на "${newStatus}"?`)) {
      return;
    }

    try {
      const updatePromises = Array.from(selectedIds).map((id) =>
        fetch(`/api/admin/listings/${id}/update-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
      );

      await Promise.all(updatePromises);
      setSelectedIds(new Set());
      setShowBulkActions(false);
      fetchListings();
    } catch (err) {
      alert('Помилка зміни статусу оголошень');
    }
  };

  if (loading && listings.length === 0) {
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
          Оголошення
        </h1>
        <p className="text-sm sm:text-base text-gray-900 mt-1 sm:mt-2">
          Управління всіма оголошеннями
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
          Фільтри
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Статус
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
            >
              <option value="all">Всі</option>
              <option value="pending">На модерації</option>
              <option value="approved">Схвалені</option>
              <option value="rejected">Відхилені</option>
              <option value="active">Активні</option>
              <option value="sold">Продані</option>
              <option value="expired">Прострочені</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Дата від
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
              Дата до
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
              Категорія
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm sm:text-base"
            >
              <option value="all">Всі</option>
              {/* Категорії можна додати динамічно */}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Пошук
            </label>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Пошук по назві, опису, локації..."
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

      {/* Bulk Actions */}
      {showBulkActions && selectedIds.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="text-indigo-900 font-medium text-sm sm:text-base">
            Вибрано: {selectedIds.size} оголошень
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <select
              onChange={(e) => handleBulkStatusChange(e.target.value)}
              className="px-3 py-1.5 border border-indigo-300 rounded-md bg-white text-gray-900 text-xs sm:text-sm flex-1 sm:flex-none"
              defaultValue=""
            >
              <option value="" disabled>Змінити статус...</option>
              <option value="approved">Схвалити</option>
              <option value="active">Активувати</option>
              <option value="rejected">Відхилити</option>
              <option value="hidden">Приховати</option>
            </select>
            <button
              onClick={handleBulkDelete}
              className="px-3 sm:px-4 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs sm:text-sm"
            >
              Видалити вибрані
            </button>
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setShowBulkActions(false);
              }}
              className="px-3 sm:px-4 py-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-xs sm:text-sm"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* Listings Table - Desktop */}
      <div className="bg-white rounded-lg shadow-md hidden lg:block w-full">
        <div className="overflow-x-auto overscroll-x-contain w-full" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 z-20 border-r border-gray-200">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === listings.length && listings.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[80px]">
                  ID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[180px]">
                  Назва
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                  Користувач
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                  Статус
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                  Перегляди
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                  Дата створення
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap min-w-[240px] sticky right-0 bg-gray-50 z-20 border-l border-gray-200">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(listing.id)}
                      onChange={() => handleSelectListing(listing.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-medium min-w-[80px]">
                    {listing.id}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900 min-w-[180px]">
                    <div className="max-w-[180px] truncate" title={listing.title}>{listing.title}</div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[140px]">
                    {listing.seller.firstName || listing.seller.username || 'Користувач'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap min-w-[100px]">
                    <span
                      className={`
                        px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap
                        ${
                          listing.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : listing.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : listing.status === 'sold'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      `}
                    >
                      {listing.status}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
                    {listing.views}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[120px]">
                    {new Date(listing.createdAt).toLocaleDateString('uk-UA')}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium min-w-[240px] sticky right-0 bg-white z-10 border-l border-gray-200">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleView(listing.id)}
                        className="text-indigo-600 hover:text-indigo-900 transition-colors whitespace-nowrap text-xs"
                      >
                        Переглянути
                      </button>
                      <button
                        onClick={() => router.push(`/admin/users/${listing.userId}`)}
                        className="text-blue-600 hover:text-blue-900 transition-colors whitespace-nowrap text-xs"
                      >
                        Користувач
                      </button>
                      <button
                        onClick={() => handleDelete(listing.id)}
                        className="text-red-600 hover:text-red-900 transition-colors whitespace-nowrap text-xs"
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

      {/* Listings Cards - Mobile */}
      <div className="lg:hidden space-y-3">
        {listings.map((listing) => (
          <div key={listing.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(listing.id)}
                  onChange={() => handleSelectListing(listing.id)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-900">ID: {listing.id}</span>
                    <span
                      className={`
                        px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap
                        ${
                          listing.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : listing.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : listing.status === 'sold'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      `}
                    >
                      {listing.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate mb-1">{listing.title}</h3>
                  <p className="text-xs text-gray-900">Користувач: {listing.seller.firstName || listing.seller.username || 'Користувач'}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-900">
              <div>
                <span className="font-medium">Перегляди:</span> {listing.views}
              </div>
              <div>
                <span className="font-medium">Дата:</span> {new Date(listing.createdAt).toLocaleDateString('uk-UA')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => handleView(listing.id)}
                className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-xs font-medium"
              >
                Переглянути
              </button>
              <button
                onClick={() => router.push(`/admin/users/${listing.userId}`)}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
              >
                Користувач
              </button>
              <button
                onClick={() => handleDelete(listing.id)}
                className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs font-medium"
              >
                Видалити
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
