import { Plus, UserPlus, Package, Edit2, Trash2, Check, X, Share2, HelpCircle, Shield, ChevronRight, Filter, ChevronDown, Wallet } from 'lucide-react';
import { ImageViewModal } from '../ImageViewModal';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { ListingCard } from '../ListingCard';
import { EditProfileModal } from '../EditProfileModal';
import { CreateListingModal } from '../CreateListingModal';
import { EditListingModal } from '../EditListingModal';
import { ShareModal } from '../ShareModal';
import { Listing, Category } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { getCategories } from '@/constants/categories';
import { useToast } from '@/hooks/useToast';
import { Toast } from '../Toast';
import { useLongPress } from '@/hooks/useLongPress';
import { getAvatarColor } from '@/utils/avatarColors';
import { getBotBaseUrl, getBotStartLink } from '@/utils/botLinks';
import { getProfileShareLink } from '@/utils/botLinks';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';

interface ProfileTabProps {
  tg: TelegramWebApp | null;
  onSelectListing?: (listing: Listing) => void;
}

export const ProfileTab = ({ tg, onSelectListing }: ProfileTabProps) => {
  const { t, language } = useLanguage();
  const categories = getCategories(t);
  const router = useRouter();
  const { profile, loading, refetch } = useUser();
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
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
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const categoryFilterRef = useRef<HTMLDivElement>(null);

  // Закриваємо dropdown при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setIsStatusFilterOpen(false);
      }
      if (categoryFilterRef.current && !categoryFilterRef.current.contains(event.target as Node)) {
        setIsCategoryFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Функція для завантаження оголошень з фільтрами
  const fetchListingsWithFilters = async (offset = 0, reset = false) => {
    if (!profile?.telegramId) return;
    
    let url = `/api/listings?userId=${profile.telegramId}&limit=16&offset=${offset}`;
    if (selectedStatus !== 'all') {
      url += `&status=${selectedStatus}`;
    }
    if (selectedCategory !== 'all') {
      url += `&category=${selectedCategory}`;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Failed to fetch listings:', response.status);
        return { listings: [], total: 0 };
      }
      const data = await response.json();
      
      if (reset) {
        setUserListings(data.listings || []);
        setListingsOffset(16);
      } else {
        setUserListings(prev => [...prev, ...(data.listings || [])]);
        setListingsOffset(prev => prev + 16);
      }
      
      setTotalListings(data.total || 0);
      setHasMore((data.listings?.length || 0) < (data.total || 0));
      return data;
    } catch (err) {
      console.error('Error fetching user listings:', err);
      return { listings: [], total: 0 };
    }
  };

  useEffect(() => {
    if (profile?.telegramId) {
      fetchListingsWithFilters(0, true);

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
    await fetchListingsWithFilters(listingsOffset, false);
    tg?.HapticFeedback.impactOccurred('light');
  };

  // Оновлюємо оголошення при зміні фільтрів
  useEffect(() => {
    if (profile?.telegramId) {
      fetchListingsWithFilters(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatus, selectedCategory, profile?.telegramId]);

  if (loading) {
    return (
      <div className="pb-24 flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (!profile) {
    // Якщо є telegramId в URL, використовуємо його для створення профілю
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const telegramId = urlParams?.get('telegramId');
    const botLink = telegramId ? getBotStartLink(telegramId) : getBotBaseUrl();
    return (
      <div className="pb-24 flex items-center justify-center min-h-screen bg-white">
        <div className="text-center px-4">
          <div className="flex items-center justify-center mx-auto mb-4">
            <UserPlus size={48} className="text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('profileNotFound.title')}</h2>
          <p className="text-gray-500 mb-6">{t('profileNotFound.description')}</p>
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
            {t('profileNotFound.createButton')}
          </a>
        </div>
      </div>
    );
  }

  const displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username || t('common.user');
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
            {profile.balance !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <Wallet size={14} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-900">
                  {t('profile.balance')}: {profile.balance.toFixed(2)} ₴
                </span>
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
                setShowShareModal(true);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-900"
            >
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Кнопка створення оголошення */}
      <div className="px-4 pt-6 pb-3">
        <button 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
          onClick={() => {
            setIsCreateListingModalOpen(true);
            tg?.HapticFeedback.impactOccurred('medium');
          }}
        >
          <Plus size={20} />
          {t('createListing.title')}
        </button>
      </div>

      {/* Кнопка поповнення балансу */}
      <div className="px-4 pb-4">
        <button 
          className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-500/20"
          onClick={() => {
            if (tg) {
              tg.showAlert('Функція поповнення балансу буде доступна найближчим часом');
            } else {
              alert('Функція поповнення балансу буде доступна найближчим часом');
            }
            tg?.HapticFeedback.impactOccurred('medium');
          }}
        >
          <Wallet size={20} />
          {t('profile.topUpBalance')}
        </button>
      </div>

      {/* Оголошення користувача */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Мої оголошення</h3>
        </div>
        
        {/* Фільтри */}
        <div className="flex gap-2 mb-4">
            {/* Фільтр за статусом */}
            <div className="relative flex-1" ref={statusFilterRef}>
              <button
                onClick={() => {
                  setIsStatusFilterOpen(!isStatusFilterOpen);
                  setIsCategoryFilterOpen(false);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="w-full px-3 py-2 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">
                  {selectedStatus === 'all' ? t('sales.allStatuses') : 
                   selectedStatus === 'active' ? t('listing.active') :
                   selectedStatus === 'sold' ? t('listing.sold') : selectedStatus}
                </span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} />
              </button>
              {isStatusFilterOpen && (
                <div className="absolute z-20 w-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg">
                  {['all', 'active', 'sold', 'pending', 'hidden'].map(status => (
                    <button
                      key={status}
                      onClick={() => {
                        setSelectedStatus(status);
                        setIsStatusFilterOpen(false);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      {status === 'all' ? t('sales.allStatuses') : 
                       status === 'active' ? t('listing.active') :
                       status === 'sold' ? t('listing.sold') :
                       status === 'pending' ? 'Очікує' :
                       status === 'hidden' ? t('editListing.hidden') : status}
                      {selectedStatus === status && <span className="text-blue-500 ml-2">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Фільтр за категорією */}
            <div className="relative flex-1" ref={categoryFilterRef}>
              <button
                onClick={() => {
                  setIsCategoryFilterOpen(!isCategoryFilterOpen);
                  setIsStatusFilterOpen(false);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="w-full px-3 py-2 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">
                  {selectedCategory === 'all' ? t('sales.allCategories') : 
                   categories.find(c => c.id === selectedCategory)?.name || selectedCategory}
                </span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${isCategoryFilterOpen ? 'rotate-180' : ''}`} />
              </button>
              {isCategoryFilterOpen && (
                <div className="absolute z-20 w-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedCategory('all');
                      setIsCategoryFilterOpen(false);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-100"
                  >
                    {t('sales.allCategories')}
                    {selectedCategory === 'all' && <span className="text-blue-500 ml-2">✓</span>}
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setIsCategoryFilterOpen(false);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                      {selectedCategory === cat.id && <span className="text-blue-500 ml-auto">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {userListings.length > 0 ? (
            <>
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
                                  showToast(t('editListing.listingMarkedSold'), 'success');
                                  // Оновлюємо список
                                  await fetchListingsWithFilters(0, true);
                                }
                              } catch (error) {
                                showToast(t('editListing.updateError'), 'error');
                              }
                              tg?.HapticFeedback.impactOccurred('light');
                            }}
                            className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
                            title={t('editListing.markAsSold')}
                          >
                            <Check size={16} />
                          </button>
                        )}
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
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(t('listing.confirmDelete'))) {
                              return;
                            }
                            try {
                              const response = await fetch(`/api/listings/${listing.id}/delete?telegramId=${profile.telegramId}`, {
                                method: 'DELETE',
                              });
                              if (response.ok) {
                                showToast(t('editListing.listingDeleted'), 'success');
                                // Оновлюємо список
                                await fetchListingsWithFilters(0, true);
                              } else {
                                showToast(t('editListing.updateError'), 'error');
                              }
                            } catch (error) {
                              showToast(t('editListing.updateError'), 'error');
                            }
                            tg?.HapticFeedback.impactOccurred('light');
                          }}
                          className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                          title={t('listing.deleteListing')}
                        >
                          <Trash2 size={16} />
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
            </>
          ) : (
            <div className="py-16 text-center">
              <div className="flex items-center justify-center mb-4">
                <Package size={64} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {selectedStatus !== 'all' || selectedCategory !== 'all' 
                  ? t('bazaar.noListingsFound') 
                  : t('sales.createFirst')}
              </h3>
              <p className="text-gray-500 text-sm">
                {selectedStatus !== 'all' || selectedCategory !== 'all'
                  ? t('bazaar.tryDifferentSearch')
                  : 'Спробуйте продати щось, але поки тільки легальні речі'}
              </p>
            </div>
          )}
        </div>

      {/* Посилання на FAQ та політику конфіденційності */}
      <div className="px-4 pb-4 pt-6 space-y-2">
        <button
          onClick={() => {
            router.push(`/${language}/faq`);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <HelpCircle size={20} className="text-gray-600" />
          <span className="flex-1 text-left text-gray-900 font-medium">{t('faq.title')}</span>
          <ChevronRight size={20} className="text-gray-400" />
        </button>
        <button
          onClick={() => {
            router.push(`/${language}/privacy`);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Shield size={20} className="text-gray-600" />
          <span className="flex-1 text-left text-gray-900 font-medium">{t('privacy.title')}</span>
          <ChevronRight size={20} className="text-gray-400" />
        </button>
      </div>

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
          formData.append('currency', listingData.currency || 'UAH');
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
            formData.append('currency', listingData.currency || 'UAH');
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

            showToast(t('editListing.listingDeleted'), 'success');
            
            // Оновлюємо список оголошень
            const data = await fetch(`/api/listings?userId=${profile.telegramId}`);
            const listingsData = await data.json();
            setUserListings(listingsData.listings || []);
          }}
          tg={tg}
        />
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

      {/* Модальне вікно поділу */}
      {profile && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          shareLink={getProfileShareLink(profile.telegramId)}
          shareText={`👤 Профіль ${displayName}${displayUsername ? ` (@${displayUsername})` : ''} в AYN Marketplace`}
          tg={tg}
        />
      )}
    </div>
  );
};

