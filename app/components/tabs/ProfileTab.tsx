import { Plus, UserPlus, Package, Edit2, Trash2, Check, Eye, X } from 'lucide-react';
import { ImageViewModal } from '../ImageViewModal';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { ListingCard } from '../ListingCard';
import { EditProfileModal } from '../EditProfileModal';
import { CreateListingModal } from '../CreateListingModal';
import { EditListingModal } from '../EditListingModal';
import { Listing } from '@/types';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { Toast } from '../Toast';
import { useLongPress } from '@/hooks/useLongPress';
import { getAvatarColor } from '@/utils/avatarColors';

interface ProfileTabProps {
  tg: TelegramWebApp | null;
  onSelectListing?: (listing: Listing) => void;
}

export const ProfileTab = ({ tg, onSelectListing }: ProfileTabProps) => {
  const { profile, loading, refetch } = useUser();
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [viewingListingHistory, setViewingListingHistory] = useState<Listing | null>(null);
  const [viewHistory, setViewHistory] = useState<Array<{ viewedAt: string; userAgent: string | null; ipAddress: string | null }>>([]);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const avatarLongPress = useLongPress({
    onLongPress: () => {
      if (profile?.avatar) {
        setShowAvatarModal(true);
        tg?.HapticFeedback.impactOccurred('medium');
      }
    },
    delay: 500,
  });
  const [hasMore, setHasMore] = useState(false);
  const [listingsOffset, setListingsOffset] = useState(0);
  const [totalListings, setTotalListings] = useState(0);
  const [stats, setStats] = useState<{
    totalListings: number;
    totalViews: number;
    soldListings: number;
    activeListings: number;
  } | null>(null);

  useEffect(() => {
    if (profile?.telegramId) {
      // Завантажуємо оголошення користувача
      fetch(`/api/listings?userId=${profile.telegramId}&limit=16&offset=0`)
        .then(res => {
          if (!res.ok) {
            console.error('Failed to fetch listings:', res.status);
            return { listings: [], total: 0 };
          }
          return res.json();
        })
        .then(data => {
          console.log('User listings loaded:', data);
          setUserListings(data.listings || []);
          setTotalListings(data.total || 0);
          setHasMore((data.listings?.length || 0) < (data.total || 0));
          setListingsOffset(16);
        })
        .catch(err => console.error('Error fetching user listings:', err));

      // Завантажуємо статистику
      fetch(`/api/user/stats?telegramId=${profile.telegramId}`)
        .then(res => {
          if (res.ok) {
            return res.json();
          }
          return null;
        })
        .then(data => {
          if (data) {
            setStats(data);
          }
        })
        .catch(err => console.error('Error fetching stats:', err));
    }
  }, [profile]);

  const loadMoreListings = async () => {
    if (!profile?.telegramId) return;
    try {
      const response = await fetch(`/api/listings?userId=${profile.telegramId}&limit=16&offset=${listingsOffset}`);
      if (response.ok) {
        const data = await response.json();
        setUserListings(prev => [...prev, ...(data.listings || [])]);
        setHasMore((listingsOffset + (data.listings?.length || 0)) < (data.total || 0));
        setListingsOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
    }
  };

  if (loading) {
    return (
      <div className="pb-24 flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Завантаження...</div>
      </div>
    );
  }

  if (!profile) {
    const botUrl = process.env.NEXT_PUBLIC_BOT_URL || 'https://t.me/your_bot';
    // Якщо є telegramId в URL, використовуємо його для створення профілю
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const telegramId = urlParams?.get('telegramId');
    const botLink = telegramId ? `${botUrl}?start=${telegramId}` : botUrl;
    return (
      <div className="pb-24 flex items-center justify-center min-h-screen bg-white">
        <div className="text-center px-4">
          <div className="flex items-center justify-center mx-auto mb-4">
            <UserPlus size={48} className="text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Профіль не знайдено</h2>
          <p className="text-gray-500 mb-6">Для використання міні-додатку необхідно створити профіль</p>
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
            onClick={() => {
              if (tg) {
                tg.openTelegramLink(botLink);
              }
            }}
          >
            <Plus size={20} />
            Створити профіль
          </a>
        </div>
      </div>
    );
  }

  const displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username || 'Користувач';
  const displayUsername = profile.username ? `@${profile.username}` : '';

  return (
    <div className="pb-24 bg-white min-h-screen">
      {/* Профіль хедер */}
      <div className="px-4 pt-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          {/* Фото профілю */}
          <div 
            className="w-20 h-20 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 relative cursor-pointer select-none"
            {...avatarLongPress}
          >
            {profile.avatar ? (
              <>
                <div className="absolute inset-0 animate-pulse bg-gray-200" />
                <img 
                  src={profile.avatar} 
                  alt={displayName}
                  className="w-full h-full object-cover relative z-10"
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      const placeholder = parent.querySelector('.avatar-placeholder');
                      if (placeholder) {
                        placeholder.classList.remove('hidden');
                      }
                    }
                  }}
                />
                <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(displayName)} text-white text-2xl font-bold relative z-10`}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(displayName)} text-white text-2xl font-bold`}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          {/* Інформація */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 mb-1 truncate">{displayName}</h2>
            {displayUsername && (
              <p className="text-sm text-gray-600 mb-2 truncate">{displayUsername}</p>
            )}
            {stats && (
              <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                <span>{stats.totalViews} переглядів</span>
                {stats.soldListings > 0 && (
                  <span>{stats.soldListings} продано</span>
                )}
                <span>{stats.activeListings} активних</span>
              </div>
            )}
          </div>

          {/* Кнопки дій */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsEditModalOpen(true);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-900"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (tg) {
                  const profileUrl = `${window.location.origin}?profile=${profile.telegramId}`;
                  const shareText = `👤 Профіль ${displayName}${displayUsername ? ` (@${displayUsername})` : ''} в AYN Marketplace\n\n${profileUrl}`;
                  tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(shareText)}`);
                  tg.HapticFeedback.impactOccurred('light');
                }
              }}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-900"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Кнопка створення оголошення */}
      <div className="px-4 pt-6 pb-4">
        <button 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
          onClick={() => {
            setIsCreateListingModalOpen(true);
            tg?.HapticFeedback.impactOccurred('medium');
          }}
        >
          <Plus size={20} />
          Створити оголошення
        </button>
      </div>

      {/* Оголошення користувача */}
      {userListings.length > 0 ? (
        <div className="px-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Мої оголошення</h3>
          <div className="grid grid-cols-2 gap-3">
            {userListings.map(listing => {
              const isSold = listing.status === 'sold';
              return (
                <div key={listing.id} className="relative group">
                  <ListingCard 
                    listing={listing}
                    isFavorite={favorites.has(listing.id)}
                    isSold={isSold}
                    onSelect={(selectedListing) => {
                      if (onSelectListing) {
                        // Завантажуємо повну інформацію про товар
                        fetch(`/api/listings/${selectedListing.id}`)
                          .then(res => res.json())
                          .then(data => {
                            const fullListing = { ...selectedListing, ...data };
                            onSelectListing(fullListing);
                          })
                          .catch(err => console.error('Error loading listing:', err));
                      }
                    }}
                    onToggleFavorite={(id) => {
                      setFavorites(prev => {
                        const newFavs = new Set(prev);
                        if (newFavs.has(id)) {
                          newFavs.delete(id);
                        } else {
                          newFavs.add(id);
                        }
                        return newFavs;
                      });
                    }}
                    tg={tg}
                  />
                  <div className="absolute top-2 left-2 flex gap-2 z-10">
                    {!isSold && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          // Підтвердження перед зміною статусу
                          if (!window.confirm('Ви впевнені, що хочете позначити це оголошення як продане?')) {
                            return;
                          }
                          try {
                            const formData = new FormData();
                            formData.append('title', listing.title);
                            formData.append('description', listing.description);
                            formData.append('price', listing.isFree ? '0' : listing.price);
                            formData.append('isFree', listing.isFree ? 'true' : 'false');
                            formData.append('category', listing.category);
                            if (listing.subcategory) {
                              formData.append('subcategory', listing.subcategory);
                            }
                            formData.append('location', listing.location);
                            formData.append('condition', listing.condition || '');
                            formData.append('telegramId', profile.telegramId);
                            formData.append('status', 'sold');

                            const response = await fetch(`/api/listings/${listing.id}/update`, {
                              method: 'PUT',
                              body: formData,
                            });

                            if (response.ok) {
                              showToast('Оголошення позначено як продане', 'success');
                              // Оновлюємо список
                              const data = await fetch(`/api/listings?userId=${profile.telegramId}`);
                              const listingsData = await data.json();
                              setUserListings(listingsData.listings || []);
                            }
                          } catch (error) {
                            showToast('Помилка оновлення', 'error');
                          }
                          tg?.HapticFeedback.impactOccurred('light');
                        }}
                        className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
                        title="Позначити як продано"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const response = await fetch(`/api/listings/${listing.id}/views?userId=${profile.telegramId}`);
                          if (response.ok) {
                            const data = await response.json();
                            setViewHistory(data.views || []);
                            setViewingListingHistory(listing);
                          }
                        } catch (error) {
                          showToast('Помилка завантаження історії', 'error');
                        }
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-purple-600 transition-colors"
                      title="Історія переглядів"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingListing(listing);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="py-6">
              <button
                onClick={loadMoreListings}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
              >
                Показати більше
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-16 text-center">
          <div className="flex items-center justify-center mb-4">
            <Package size={64} className="text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Створіть перше оголошення</h3>
          <p className="text-gray-500 text-sm">Спробуйте продати щось, але поки тільки легальні речі</p>
        </div>
      )}

      {/* Модальне вікно редагування */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentFirstName={profile.firstName}
        currentLastName={profile.lastName}
        currentAvatar={profile.avatar}
        onSave={async (firstName, lastName, avatarFile) => {
          const formData = new FormData();
          formData.append('telegramId', profile.telegramId);
          formData.append('firstName', firstName);
          formData.append('lastName', lastName);
          if (avatarFile) {
            formData.append('avatar', avatarFile);
          }

          const response = await fetch('/api/user/profile/update', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Failed to update profile');
          }

          // Оновлюємо профіль відразу
          await refetch();
        }}
        tg={tg}
      />

      {/* Модальне вікно створення оголошення */}
      <CreateListingModal
        isOpen={isCreateListingModalOpen}
        onClose={() => setIsCreateListingModalOpen(false)}
        onSave={async (listingData) => {
          const formData = new FormData();
          formData.append('title', listingData.title);
          formData.append('description', listingData.description);
          formData.append('price', listingData.price);
          formData.append('isFree', listingData.isFree.toString());
          formData.append('category', listingData.category);
          if (listingData.subcategory) {
            formData.append('subcategory', listingData.subcategory);
          }
          formData.append('location', listingData.location);
          formData.append('condition', listingData.condition);
          formData.append('telegramId', profile.telegramId);
          
          listingData.images.forEach((image: File) => {
            formData.append('images', image);
          });

          const response = await fetch('/api/listings/create', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Failed to create listing');
          }

          // Оновлюємо список оголошень
          const data = await fetch(`/api/listings?userId=${profile.telegramId}`);
          const listingsData = await data.json();
          setUserListings(listingsData.listings || []);
        }}
        tg={tg}
      />

      {/* Модальне вікно редагування оголошення */}
      {editingListing && (
        <EditListingModal
          isOpen={!!editingListing}
          onClose={() => setEditingListing(null)}
          listing={editingListing}
          onSave={async (listingData) => {
            const formData = new FormData();
            formData.append('title', listingData.title);
            formData.append('description', listingData.description);
            formData.append('price', listingData.price);
            formData.append('isFree', listingData.isFree.toString());
            formData.append('category', listingData.category);
            if (listingData.subcategory) {
              formData.append('subcategory', listingData.subcategory);
            }
            formData.append('location', listingData.location);
            formData.append('condition', listingData.condition);
            formData.append('telegramId', profile.telegramId);
            formData.append('status', listingData.status || 'active');
            
            listingData.images.forEach((image: File) => {
              formData.append('images', image);
            });

            const response = await fetch(`/api/listings/${editingListing.id}/update`, {
              method: 'PUT',
              body: formData,
            });

            if (!response.ok) {
              throw new Error('Failed to update listing');
            }

            showToast('Оголошення оновлено', 'success');
            
            // Оновлюємо список оголошень
            const data = await fetch(`/api/listings?userId=${profile.telegramId}`);
            const listingsData = await data.json();
            setUserListings(listingsData.listings || []);
            setEditingListing(null);
          }}
          onDelete={async () => {
            const response = await fetch(`/api/listings/${editingListing.id}/delete?telegramId=${profile.telegramId}`, {
              method: 'DELETE',
            });

            if (!response.ok) {
              throw new Error('Failed to delete listing');
            }

            showToast('Оголошення видалено', 'success');
            
            // Оновлюємо список оголошень
            const data = await fetch(`/api/listings?userId=${profile.telegramId}`);
            const listingsData = await data.json();
            setUserListings(listingsData.listings || []);
          }}
          tg={tg}
        />
      )}

      {/* Модальне вікно історії переглядів */}
      {viewingListingHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Історія переглядів</h3>
              <button
                onClick={() => {
                  setViewingListingHistory(null);
                  setViewHistory([]);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-900"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">{viewingListingHistory.title}</p>
            {viewHistory.length > 0 ? (
              <div className="space-y-2">
                {viewHistory.map((view, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium text-gray-900">
                      Перегляд #{index + 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Поки немає переглядів</p>
            )}
          </div>
        </div>
      )}

      {/* Модальне вікно для перегляду аватара */}
      {profile.avatar && (
        <ImageViewModal
          isOpen={showAvatarModal}
          imageUrl={profile.avatar}
          alt={displayName}
          onClose={() => setShowAvatarModal(false)}
        />
      )}

      {/* Toast сповіщення */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

