'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Listing {
  id: number;
  title: string;
  description: string;
  price: string;
  currency: string;
  images: string;
  category: string;
  location: string | null;
  createdAt: string;
  source?: 'marketplace' | 'telegram';
  user: {
    id: number;
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export default function ModerationPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      const response = await fetch('/api/admin/moderation?status=pending');
      const data = await response.json();
      
      if (response.ok) {
        setListings(data.listings || []);
      } else {
        console.error('Failed to fetch listings:', data.error);
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (listing: Listing) => {
    if (!confirm('Ви впевнені, що хочете схвалити це оголошення?')) {
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          action: 'approve',
          source: listing.source || 'marketplace',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Оголошення схвалено');
        fetchListings();
      } else {
        alert(`Помилка: ${data.error}`);
      }
    } catch (error) {
      console.error('Error approving listing:', error);
      alert('Помилка при схваленні оголошення');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectClick = (listing: Listing) => {
    setSelectedListing(listing);
    setShowRejectModal(true);
    setRejectionReason('');
  };

  const handleRejectConfirm = async () => {
    if (!selectedListing) return;
    if (!rejectionReason.trim()) {
      alert('Вкажіть причину відхилення');
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: selectedListing.id,
          action: 'reject',
          reason: rejectionReason,
          source: selectedListing.source || 'marketplace',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Оголошення відхилено, кошти повернуто');
        setShowRejectModal(false);
        setSelectedListing(null);
        fetchListings();
      } else {
        alert(`Помилка: ${data.error}`);
      }
    } catch (error) {
      console.error('Error rejecting listing:', error);
      alert('Помилка при відхиленні оголошення');
    } finally {
      setActionLoading(false);
    }
  };

  const getImageUrl = (images: string) => {
    try {
      const parsed = JSON.parse(images);
      return parsed[0] || '/placeholder.png';
    } catch {
      return '/placeholder.png';
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Модерація оголошень</h1>
        <p className="text-gray-600">Оголошень на модерації: {listings.length}</p>
      </div>

      {listings.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Немає оголошень на модерації
          </h2>
          <p className="text-gray-600">Всі оголошення перевірено</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {listings.map((listing) => (
            <div key={listing.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex gap-6">
                  {/* Зображення */}
                  <div className="flex-shrink-0">
                    <img
                      src={getImageUrl(listing.images)}
                      alt={listing.title}
                      className="w-48 h-48 object-cover rounded-lg"
                    />
                  </div>

                  {/* Інформація */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                          {listing.title}
                        </h3>
                        <p className="text-2xl font-bold text-blue-600 mb-2">
                          {listing.price} {listing.currency}
                        </p>
                        <p className="text-gray-600 mb-2">
                          {listing.description.substring(0, 200)}
                          {listing.description.length > 200 && '...'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-900">
                      <div>
                        <span className="text-gray-500">Джерело:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {listing.source === 'telegram' ? '📱 Telegram бот' : '🌐 Маркетплейс'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Категорія:</span>
                        <span className="ml-2 font-medium text-gray-900">{listing.category}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Локація:</span>
                        <span className="ml-2 font-medium text-gray-900">{listing.location || 'Не вказано'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Користувач:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {listing.user.firstName} {listing.user.lastName}
                          {listing.user.username && ` (@${listing.user.username})`}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Створено:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {new Date(listing.createdAt).toLocaleDateString('uk-UA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Дії */}
                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => handleApprove(listing)}
                        disabled={actionLoading}
                        className="px-6 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium disabled:opacity-50"
                      >
                        ✅ Схвалити
                      </button>
                      <button
                        onClick={() => handleRejectClick(listing)}
                        disabled={actionLoading}
                        className="px-6 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
                      >
                        ❌ Відхилити
                      </button>
                      <Link
                        href={`/admin/listings/${listing.id}`}
                        className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                      >
                        👁️ Переглянути
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модальне вікно відхилення */}
      {showRejectModal && selectedListing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Відхилити оголошення
            </h2>
            <p className="text-gray-600 mb-4">
              Вкажіть причину відхилення. Кошти будуть повернуті користувачу.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Причина відхилення..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none h-32 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRejectConfirm}
                disabled={actionLoading || !rejectionReason.trim()}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
              >
                {actionLoading ? 'Обробка...' : 'Відхилити'}
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedListing(null);
                }}
                disabled={actionLoading}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
