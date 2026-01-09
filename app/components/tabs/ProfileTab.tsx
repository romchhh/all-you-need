import { Plus, UserPlus, Package, Edit2, Trash2, Check, X, Share2, HelpCircle, Shield, ChevronRight, Filter, ChevronDown, Wallet, Megaphone } from 'lucide-react';
import { ImageViewModal } from '../ImageViewModal';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { ListingCard } from '../ListingCard';
import { ProfileListingCard } from '../ProfileListingCard';
import { EditProfileModal } from '../EditProfileModal';
import { EditListingModal } from '../EditListingModal';
import { ShareModal } from '../ShareModal';
import { ConfirmModal } from '../ConfirmModal';
import { Listing, Category } from '@/types';
import { useState, useEffect, useRef, useMemo } from 'react';
import { getCategories } from '@/constants/categories';
import { useToast } from '@/hooks/useToast';
import { Toast } from '../Toast';
import { useLongPress } from '@/hooks/useLongPress';
import { getAvatarColor } from '@/utils/avatarColors';
import { getBotBaseUrl, getBotStartLink } from '@/utils/botLinks';
import { getProfileShareLink } from '@/utils/botLinks';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { LanguageSwitcher } from '../LanguageSwitcher';

interface ProfileTabProps {
  tg: TelegramWebApp | null;
  onSelectListing?: (listing: Listing) => void;
  onCreateListing?: () => void;
  onEditModalChange?: (isOpen: boolean) => void;
}

export const ProfileTab = ({ tg, onSelectListing, onCreateListing, onEditModalChange }: ProfileTabProps) => {
  const { t, language } = useLanguage();
  const categories = getCategories(t);
  const router = useRouter();
  const { profile, loading, refetch } = useUser();
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  
  // Повідомляємо батьківський компонент про зміну стану модального вікна
  useEffect(() => {
    onEditModalChange?.(!!editingListing);
  }, [editingListing, onEditModalChange]);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
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
  const [pendingStatus, setPendingStatus] = useState<string>('all');
  const [pendingCategory, setPendingCategory] = useState<string>('all');
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  
  // Синхронізуємо pendingStatus та pendingCategory з selectedStatus та selectedCategory
  useEffect(() => {
    if (!isStatusFilterOpen) {
      setPendingStatus(selectedStatus);
    }
  }, [selectedStatus, isStatusFilterOpen]);
  
  useEffect(() => {
    if (!isCategoryFilterOpen) {
      setPendingCategory(selectedCategory);
    }
  }, [selectedCategory, isCategoryFilterOpen]);
  const statusFilterRef = useRef<HTMLButtonElement>(null);
  const categoryFilterRef = useRef<HTMLButtonElement>(null);
  const [statusMenuPosition, setStatusMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const [categoryMenuPosition, setCategoryMenuPosition] = useState({ top: 0, left: 0, width: 0 });

  // Оновлюємо позиції меню при відкритті
  useEffect(() => {
    if (isStatusFilterOpen && statusFilterRef.current) {
      const rect = statusFilterRef.current.getBoundingClientRect();
      setStatusMenuPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isStatusFilterOpen]);

  useEffect(() => {
    if (isCategoryFilterOpen && categoryFilterRef.current) {
      const rect = categoryFilterRef.current.getBoundingClientRect();
      setCategoryMenuPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isCategoryFilterOpen]);

  // Закриваємо dropdown при кліку поза ним
  useEffect(() => {
    if (!isStatusFilterOpen && !isCategoryFilterOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (statusFilterRef.current && !statusFilterRef.current.contains(target)) {
        const statusMenu = document.getElementById('status-filter-menu');
        if (statusMenu && !statusMenu.contains(target)) {
          setPendingStatus(selectedStatus);
          setIsStatusFilterOpen(false);
        }
      }
      if (categoryFilterRef.current && !categoryFilterRef.current.contains(target)) {
        const categoryMenu = document.getElementById('category-filter-menu');
        if (categoryMenu && !categoryMenu.contains(target)) {
          setPendingCategory(selectedCategory);
          setIsCategoryFilterOpen(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as any);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [isStatusFilterOpen, isCategoryFilterOpen]);

  // Функція для завантаження оголошень з фільтрами
  const fetchListingsWithFilters = async (offset = 0, reset = false) => {
    if (!profile?.telegramId) return;
    
    let url = `/api/listings?userId=${profile.telegramId}&viewerId=${profile.telegramId}&limit=16&offset=${offset}`;
    if (selectedStatus !== 'all') {
      // Конвертуємо 'deactivated' в 'hidden' для API
      const apiStatus = selectedStatus === 'deactivated' ? 'hidden' : selectedStatus;
      url += `&status=${apiStatus}`;
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
    <>
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
                  src={(() => {
                    if (profile.avatar?.startsWith('http')) return profile.avatar;
                    const cleanPath = profile.avatar?.split('?')[0] || profile.avatar;
                    const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
                    return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
                  })()}
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
                <div className="flex items-center gap-1">
                  <Megaphone size={14} className="text-gray-500" />
                  <span>{stats.activeListings} {t('sales.active')}</span>
                </div>
                {stats.soldListings > 0 && (
                  <span>{stats.soldListings} {t('sales.sold')}</span>
                )}
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
            if (onCreateListing) {
              onCreateListing();
            }
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
              tg.showAlert(t('sales.topUpBalanceSoon'));
            } else {
              showToast(t('sales.topUpBalanceSoon'), 'info');
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
          <h3 className="text-lg font-semibold text-gray-900">{t('sales.title')}</h3>
        </div>
        
        {/* Фільтри */}
        <div className="flex gap-2 mb-4">
            {/* Фільтр за статусом */}
            <button
              ref={statusFilterRef}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsStatusFilterOpen(!isStatusFilterOpen);
                setIsCategoryFilterOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="flex-1 px-3 py-2 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-between text-sm"
            >
              <span className="text-gray-700">
                {selectedStatus === 'all' ? t('sales.allStatuses') : 
                 selectedStatus === 'active' ? t('listing.active') :
                 selectedStatus === 'sold' ? t('listing.sold') :
                 selectedStatus === 'pending' ? t('sales.pending') :
                 selectedStatus === 'deactivated' ? t('sales.deactivated') : selectedStatus}
              </span>
              <ChevronDown size={16} className={`text-gray-400 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Фільтр за категорією */}
            <button
              ref={categoryFilterRef}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsCategoryFilterOpen(!isCategoryFilterOpen);
                setIsStatusFilterOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="flex-1 px-3 py-2 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-between text-sm"
            >
              <span className="text-gray-700 flex items-center gap-2 truncate">
                {selectedCategory === 'all' ? (
                  t('sales.allCategories')
                ) : (
                  <>
                    <span className="flex-shrink-0">{categories.find(c => c.id === selectedCategory)?.icon}</span>
                    <span className="truncate">{categories.find(c => c.id === selectedCategory)?.name || selectedCategory}</span>
                  </>
                )}
              </span>
              <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${isCategoryFilterOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Backdrop для статусу */}
          {isStatusFilterOpen && (
            <div 
              className="fixed inset-0 z-[9999]"
              onClick={() => {
                setIsStatusFilterOpen(false);
              }}
            />
          )}

          {/* Меню статусу */}
          {isStatusFilterOpen && (
            <div 
              id="status-filter-menu"
              className="fixed bg-white rounded-xl border border-gray-200 shadow-2xl z-[10000]"
              style={{
                top: `${statusMenuPosition.top + 8}px`,
                left: `${statusMenuPosition.left}px`,
                width: `${statusMenuPosition.width}px`
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {['all', 'active', 'sold', 'pending', 'deactivated'].map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedStatus(status);
                    setIsStatusFilterOpen(false);
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                    selectedStatus === status ? 'bg-blue-50' : ''
                  }`}
                >
                  {status === 'all' ? t('sales.allStatuses') : 
                   status === 'active' ? t('listing.active') :
                   status === 'sold' ? t('listing.sold') :
                   status === 'pending' ? t('sales.pending') :
                   status === 'deactivated' ? t('sales.deactivated') : status}
                  {selectedStatus === status && <span className="text-blue-500 ml-2">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Backdrop для категорії */}
          {isCategoryFilterOpen && (
            <div 
              className="fixed inset-0 z-[9999]"
              onClick={() => {
                setIsCategoryFilterOpen(false);
              }}
            />
          )}

          {/* Меню категорії */}
          {isCategoryFilterOpen && (
            <div 
              id="category-filter-menu"
              className="fixed bg-white rounded-xl border border-gray-200 shadow-2xl z-[10000] max-h-[70vh] overflow-y-auto"
              style={{
                top: `${categoryMenuPosition.top + 8}px`,
                left: `${categoryMenuPosition.left}px`,
                width: `${categoryMenuPosition.width}px`
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedCategory('all');
                  setIsCategoryFilterOpen(false);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 border-b border-gray-100 ${
                  selectedCategory === 'all'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">📦</span>
                <span className="flex-1">{t('sales.allCategories')}</span>
                {selectedCategory === 'all' && <span className="text-blue-500">✓</span>}
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedCategory(cat.id);
                    setIsCategoryFilterOpen(false);
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 border-b border-gray-100 ${
                    selectedCategory === cat.id
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{cat.icon}</span>
                  <span className="flex-1">{cat.name}</span>
                  {selectedCategory === cat.id && <span className="text-blue-500 flex-shrink-0">✓</span>}
                </button>
              ))}
            </div>
          )}

          {userListings.length > 0 ? (
            <>
              <div className="space-y-3">
                {userListings.map(listing => {
                  const isSold = listing.status === 'sold';
                  const isDeactivated = listing.status === 'hidden';
                  return (
                    <ProfileListingCard
                      key={listing.id}
                        listing={{ ...listing, favoritesCount: listing.favoritesCount || 0 }}
                        isFavorite={favorites.has(listing.id)}
                        isSold={isSold}
                        isDeactivated={isDeactivated}
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
                      onEdit={() => {
                        setEditingListing(listing);
                      }}
                      onMarkAsSold={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: t('editListing.markAsSold'),
                          message: t('editListing.confirmMarkSold'),
                          onConfirm: async () => {
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
                                  await fetchListingsWithFilters(0, true);
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
                              } catch (error) {
                                showToast(t('editListing.updateError'), 'error');
                              }
                          },
                          confirmText: t('editListing.markAsSold'),
                          cancelText: t('common.cancel'),
                          confirmButtonClass: 'bg-green-500 hover:bg-green-600',
                        });
                      }}
                      onPromote={() => {
                        showToast(t('sales.promoteSoon'), 'info');
                      }}
                      tg={tg}
                    />
                  );
                })}
              </div>
              {hasMore && (
                <div className="py-6">
                  <button
                    onClick={loadMoreListings}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
                  >
                    {t('sales.showMore')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-16 text-center">
              <div className="text-gray-400 mb-4">
                <Package size={64} className="mx-auto" />
              </div>
              <p className="text-gray-500 mb-2">{t('sales.noListings')}</p>
              <p className="text-sm text-gray-400">{t('sales.createFirst')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Кнопки налаштувань */}
      <div className="px-4 py-6 space-y-3">
        <LanguageSwitcher tg={tg} />
        
        <button
          onClick={() => {
            router.push(`/${language}/faq`);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <HelpCircle size={20} className="text-gray-600" />
            <span className="text-gray-900 font-medium">{t('navigation.faq')}</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={() => {
            router.push(`/${language}/privacy`);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-gray-600" />
            <span className="text-gray-900 font-medium">{t('privacy.title')}</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>
      </div>

      {/* Модальне вікно перегляду аватара */}
      {showAvatarModal && profile?.avatar && (
        <ImageViewModal
          isOpen={showAvatarModal}
          images={[profile.avatar]}
          initialIndex={0}
          alt={t('profile.avatar')}
          onClose={() => setShowAvatarModal(false)}
        />
      )}

      {/* Модальне вікно редагування профілю */}
      {profile && (
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
            method: 'PUT',
            body: formData,
          });

          if (response.ok) {
            refetch();
            setIsEditModalOpen(false);
          }
        }}
        tg={tg}
      />
      )}


      {/* Модальне вікно редагування оголошення */}
      {editingListing && profile && (
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

            if (response.ok) {
              showToast(t('editListing.listingUpdated'), 'success');
              // Оновлюємо список з урахуванням поточних фільтрів
              await fetchListingsWithFilters(0, true);
              // Оновлюємо статистику
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
              
            setEditingListing(null);
            }
          }}
          onDelete={async () => {
            const response = await fetch(`/api/listings/${editingListing.id}/delete?telegramId=${profile.telegramId}`, {
              method: 'DELETE',
            });

            if (response.ok) {
            showToast(t('editListing.listingDeleted'), 'success');
              // Оновлюємо список з урахуванням поточних фільтрів
              await fetchListingsWithFilters(0, true);
              // Оновлюємо статистику
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
              
              setEditingListing(null);
            }
          }}
          tg={tg}
        />
      )}

      {/* Модальне вікно поділу */}
      {profile && (
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareLink={getProfileShareLink(profile.telegramId)}
        shareText={`👤 Профіль ${profile.firstName} ${profile.lastName} в AYN Marketplace`}
        tg={tg}
      />
      )}

      {/* Модальне вікно підтвердження */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmButtonClass={confirmModal.confirmButtonClass}
        tg={tg}
      />

      {/* Toast сповіщення */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </>
  );
};
