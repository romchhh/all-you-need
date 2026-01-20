import { Plus, UserPlus, Package, Edit2, Trash2, Check, X, Share2, HelpCircle, Shield, ChevronRight, Filter, ChevronDown, Wallet, Megaphone, MessageCircle } from 'lucide-react';
import { NavIcon } from '../NavIcon';
import { ImageViewModal } from '../ImageViewModal';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { ListingCard } from '../ListingCard';
import { ProfileListingCard } from '../ProfileListingCard';
import { EditProfileModal } from '../EditProfileModal';
import { EditListingModal } from '../EditListingModal';
import { ShareModal } from '../ShareModal';
import { ConfirmModal } from '../ConfirmModal';
import { TopUpBalanceModal } from '../TopUpBalanceModal';
import dynamic from 'next/dynamic';
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
import { CategoryIcon } from '../CategoryIcon';

// Динамічний імпорт PromotionUpgradeModal та ReactivateListingFlow
const PromotionUpgradeModal = dynamic(() => import('../PromotionUpgradeModal'), {
  ssr: false,
});
const ReactivateListingFlow = dynamic(() => import('../ReactivateListingFlow'), {
  ssr: false,
});

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
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [selectedListingForPromotion, setSelectedListingForPromotion] = useState<Listing | null>(null);
  // Звідки відкрито модалку реклами: 'auto' (система запропонувала) або 'manual' (користувач натиснув «Рекламувати»)
  const [promotionOpenSource, setPromotionOpenSource] = useState<'auto' | 'manual' | null>(null);
  const [showReactivateFlow, setShowReactivateFlow] = useState(false);
  const [selectedListingForReactivation, setSelectedListingForReactivation] = useState<number | null>(null);
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
        <div className="text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  if (!profile) {
    // Якщо є telegramId в URL, використовуємо його для створення профілю
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const telegramId = urlParams?.get('telegramId');
    const botLink = telegramId ? getBotStartLink(telegramId) : getBotBaseUrl();
    return (
      <div className="pb-24 flex flex-col h-screen overflow-hidden px-4">
        <h2 className="text-2xl font-bold text-white mb-2 pt-2">Профіль</h2>
        <p className="text-sm text-gray-400 mb-8">Ваш особистий профіль</p>
        
        <div className="flex-1 flex items-start justify-center pt-8 pb-20">
          <div className="max-w-sm mx-auto px-4">
            <div className="border-2 border-gray-600 rounded-3xl p-8 text-center">
              <div className="flex items-center justify-center mx-auto mb-6">
                <div className="text-white" style={{ width: '64px', height: '64px' }}>
                  <svg width="64" height="64" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M37 19.4959C37.0055 22.9702 35.9722 26.3667 34.0328 29.2493C32.4333 31.6351 30.2705 33.5901 27.7358 34.9412C25.201 36.2924 22.3724 36.9981 19.5 36.9959C16.6276 36.9981 13.7989 36.2924 11.2642 34.9412C8.72943 33.5901 6.56668 31.6351 4.96722 29.2493C3.4442 26.979 2.47425 24.3834 2.13515 21.6707C1.79605 18.958 2.09721 16.2035 3.01451 13.6282C3.9318 11.0528 5.43971 8.72817 7.41735 6.84063C9.39499 4.95309 11.7873 3.55513 14.4026 2.75882C17.0179 1.96252 19.7834 1.79002 22.4774 2.25515C25.1714 2.72028 27.7189 3.8101 29.9158 5.43725C32.1127 7.06441 33.8978 9.18363 35.128 11.625C36.3582 14.0664 36.9993 16.7621 37 19.4959Z" stroke="currentColor" strokeWidth="4"/>
                    <path d="M21.4445 13.6626C21.4445 14.1783 21.2397 14.6729 20.875 15.0375C20.5104 15.4022 20.0158 15.6071 19.5001 15.6071V19.4959C21.0472 19.4959 22.5309 18.8814 23.6249 17.7874C24.7188 16.6934 25.3334 15.2097 25.3334 13.6626H21.4445ZM19.5001 15.6071C18.9844 15.6071 18.4898 15.4022 18.1252 15.0375C17.7605 14.6729 17.5556 14.1783 17.5556 13.6626H13.6668C13.6668 15.2097 14.2813 16.6934 15.3753 17.7874C16.4693 18.8814 17.953 19.4959 19.5001 19.4959V15.6071ZM17.5556 13.6626C17.5556 13.1469 17.7605 12.6523 18.1252 12.2877C18.4898 11.923 18.9844 11.7182 19.5001 11.7182V7.82928C17.953 7.82928 16.4693 8.44387 15.3753 9.53783C14.2813 10.6318 13.6668 12.1155 13.6668 13.6626H17.5556ZM19.5001 11.7182C20.0158 11.7182 20.5104 11.923 20.875 12.2877C21.2397 12.6523 21.4445 13.1469 21.4445 13.6626H25.3334C25.3334 12.1155 24.7188 10.6318 23.6249 9.53783C22.5309 8.44387 21.0472 7.82928 19.5001 7.82928V11.7182ZM6.21176 30.8826L4.34704 30.3284L4.04565 31.3454L4.73593 32.1484L6.21176 30.8826ZM32.7884 30.8826L34.2662 32.1484L34.9545 31.3454L34.6531 30.3284L32.7884 30.8826ZM13.6668 27.2737H25.3334V23.3848H13.6668V27.2737ZM13.6668 23.3848C11.5727 23.3842 9.5344 24.0597 7.85516 25.3108C6.17593 26.5619 4.94552 28.3217 4.34704 30.3284L8.07454 31.4368C8.43421 30.2333 9.17274 29.178 10.1803 28.4279C11.1879 27.6778 12.4107 27.273 13.6668 27.2737V23.3848ZM19.5001 35.0515C17.2552 35.054 15.0365 34.5694 12.9971 33.6311C10.9577 32.6928 9.14621 31.3232 7.6876 29.6168L4.73593 32.1484C6.5596 34.2805 8.8239 35.9918 11.3728 37.1644C13.9216 38.3369 16.6944 38.9429 19.5001 38.9404V35.0515ZM25.3334 27.2737C27.972 27.2737 30.2062 29.0276 30.9256 31.4387L34.6531 30.3284C34.0547 28.322 32.8227 26.5624 31.1438 25.3113C29.465 24.0603 27.4271 23.3846 25.3334 23.3848V27.2737ZM31.3126 29.6168C29.854 31.3232 28.0425 32.6928 26.0031 33.6311C23.9637 34.5694 21.745 35.054 19.5001 35.0515V38.9404C22.3057 38.9429 25.0785 38.3369 27.6274 37.1644C30.1763 35.9918 32.4425 34.2805 34.2662 32.1484L31.3126 29.6168Z" fill="currentColor"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{t('profileNotFound.title')}</h3>
              <p className="text-sm text-gray-400">{t('profileNotFound.description')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username || t('common.user');
  const displayUsername = profile.username ? `@${profile.username}` : '';

  return (
    <>
    <div className="pb-24 min-h-screen">
      {/* Профіль хедер */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-start gap-4">
          {/* Фото профілю */}
          <div 
            className="w-16 h-16 rounded-full overflow-hidden bg-white flex-shrink-0 relative cursor-pointer select-none border-2 border-white"
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
                <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gray-800 text-white text-xl font-bold relative z-10`}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex items-center justify-center bg-gray-800 text-white text-xl font-bold`}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          {/* Інформація */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white mb-1 truncate">{displayName}</h2>
                {displayUsername && (
                  <p className="text-sm text-white/70 truncate">{displayUsername}</p>
                )}
              </div>
              
              {/* Кнопки дій */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    setShowShareModal(true);
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="w-10 h-10 rounded-full border border-white flex items-center justify-center hover:bg-white/10 transition-colors text-white"
                >
                  <Share2 size={18} />
                </button>
                <button
                  onClick={() => {
                    setIsEditModalOpen(true);
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="w-10 h-10 rounded-full border border-white flex items-center justify-center hover:bg-white/10 transition-colors text-white"
                >
                  <Edit2 size={18} />
                </button>
              </div>
            </div>
            
            {/* Статистика */}
            <div className="space-y-1.5 mt-3">
              {stats && (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <Megaphone size={16} className="text-white/70 flex-shrink-0" />
                  <span>{stats.activeListings} {t('sales.active')}</span>
                </div>
              )}
              {profile.balance !== undefined && (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <Wallet size={16} className="text-white/70 flex-shrink-0" />
                  <span>{t('profile.balance')}: {profile.balance.toFixed(2)}€</span>
                </div>
              )}
              {profile.listingPackagesBalance !== undefined && profile.listingPackagesBalance > 0 && (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <Package size={16} className="text-white/70 flex-shrink-0" />
                  <span>{profile.listingPackagesBalance} {t('profile.availableListings')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки дій */}
      <div className="px-4 space-y-3 pb-4">
        {/* Кнопка поповнення балансу */}
        <button 
          className="w-full bg-[#D3F1A7] hover:bg-[#D3F1A7]/90 text-black font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors"
          onClick={() => {
            setShowTopUpModal(true);
            tg?.HapticFeedback.impactOccurred('medium');
          }}
        >
          <Wallet size={20} />
          {t('profile.topUpBalance')}
        </button>

        {/* Кнопка створення оголошення */}
        <button 
          className="w-full bg-transparent hover:bg-white/10 border-2 border-white text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors"
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

      {/* Розділювач */}
      <div className="px-4 pb-4">
        <div className="border-t border-white/20"></div>
      </div>

      {/* Оголошення користувача */}
      <div className="px-4">
        <h3 className="text-lg font-semibold text-white mb-3">{t('sales.title')}</h3>
        
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
              className="flex-1 px-3 py-2.5 bg-[#000000] rounded-xl border border-white/20 flex items-center justify-between text-sm hover:border-white/40 transition-colors"
            >
              <span className="text-white">
                {selectedStatus === 'all' ? t('sales.allStatuses') : 
                 selectedStatus === 'active' ? t('listing.active') :
                 selectedStatus === 'pending_moderation' ? t('profile.onModeration') :
                 selectedStatus === 'deactivated' ? t('sales.deactivated') :
                 selectedStatus === 'sold' ? t('listing.sold') : selectedStatus}
              </span>
              <ChevronDown size={16} className={`text-white/70 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} />
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
              className="flex-1 px-3 py-2.5 bg-[#000000] rounded-xl border border-white/20 flex items-center justify-between text-sm hover:border-white/40 transition-colors"
            >
              <span className="text-white truncate">
                {selectedCategory === 'all' ? (
                  t('sales.allCategories')
                ) : (
                  categories.find(c => c.id === selectedCategory)?.name || selectedCategory
                )}
              </span>
              <ChevronDown size={16} className={`text-white/70 flex-shrink-0 transition-transform ${isCategoryFilterOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Backdrop для статусу */}
          {isStatusFilterOpen && (
            <div 
              className="fixed inset-0 z-[9999]"
              onClick={() => {
                setIsStatusFilterOpen(false);
              }}
              onWheel={(e) => {
                // Предотвращаем закрытие меню при скролле фона
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Предотвращаем закрытие меню при скролле на мобильных
                e.stopPropagation();
              }}
            />
          )}

          {/* Меню статусу */}
          {isStatusFilterOpen && (
            <div 
              id="status-filter-menu"
              className="fixed bg-[#1C1C1C] rounded-xl border border-white/20 shadow-2xl z-[10000] max-h-[50vh] overflow-y-auto overscroll-contain"
              style={{
                top: `${statusMenuPosition.top + 8}px`,
                left: `${statusMenuPosition.left}px`,
                width: `${statusMenuPosition.width}px`
              }}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                // Разрешаем скролл внутри меню
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Разрешаем скролл на мобильных устройствах
                e.stopPropagation();
              }}
            >
              {['all', 'active', 'pending_moderation', 'deactivated', 'sold'].map(status => (
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
                  className={`w-full px-3 py-2.5 text-left text-sm hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0 ${
                    selectedStatus === status ? 'bg-[#D3F1A7]/20 text-[#D3F1A7]' : 'text-white'
                  }`}
                >
                  {status === 'all' ? t('sales.allStatuses') : 
                   status === 'active' ? t('listing.active') :
                   status === 'pending_moderation' ? t('profile.onModeration') :
                   status === 'deactivated' ? t('sales.deactivated') :
                   status === 'sold' ? t('listing.sold') : status}
                  {selectedStatus === status && <span className="text-[#D3F1A7] ml-2">✓</span>}
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
              onWheel={(e) => {
                // Предотвращаем закрытие меню при скролле фона
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Предотвращаем закрытие меню при скролле на мобильных
                e.stopPropagation();
              }}
            />
          )}

          {/* Меню категорії */}
          {isCategoryFilterOpen && (
            <div 
              id="category-filter-menu"
              className="fixed bg-[#1C1C1C] rounded-xl border border-white/20 shadow-2xl z-[10000] max-h-[70vh] overflow-y-auto overscroll-contain"
              style={{
                top: `${categoryMenuPosition.top + 8}px`,
                left: `${categoryMenuPosition.left}px`,
                width: `${categoryMenuPosition.width}px`
              }}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                // Разрешаем скролл внутри меню
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Разрешаем скролл на мобильных устройствах
                e.stopPropagation();
              }}
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
                className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between border-b border-white/10 ${
                  selectedCategory === 'all'
                    ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <span className="flex-1">{t('sales.allCategories')}</span>
                {selectedCategory === 'all' && <span className="text-[#D3F1A7]">✓</span>}
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
                  className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between border-b border-white/10 ${
                    selectedCategory === cat.id
                      ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <span className="flex-1">{cat.name}</span>
                  {selectedCategory === cat.id && <span className="text-[#D3F1A7] flex-shrink-0">✓</span>}
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
                  const isExpired = listing.status === 'expired';
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
                        // Забороняємо редагувати оголошення на модерації
                        if (listing.status === 'pending_moderation') {
                          showToast(t('editListing.cannotEditOnModeration') || 'Не можна редагувати оголошення під час модерації', 'error');
                          tg?.HapticFeedback.notificationOccurred('error');
                          return;
                        }
                        setEditingListing(listing);
                      }}
                      onReactivate={() => {
                        // Відкриваємо флоу реактивації
                        console.log('[ProfileTab] Opening reactivation flow for listing:', listing.id);
                        setSelectedListingForReactivation(listing.id);
                        setShowReactivateFlow(true);
                        tg?.HapticFeedback.impactOccurred('light');
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
                                  tg?.HapticFeedback.notificationOccurred('success');
                                  // Закриваємо модальне вікно після успішного оновлення
                                  setConfirmModal({ ...confirmModal, isOpen: false });
                                  // Оновлюємо список оголошень
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
                                  // Оновлюємо сторінку
                                  router.refresh();
                                } else {
                                  const errorData = await response.json().catch(() => ({}));
                                  console.error('Error updating listing:', errorData);
                                  showToast(t('editListing.updateError'), 'error');
                                }
                              } catch (error) {
                                console.error('Error marking listing as sold:', error);
                                showToast(t('editListing.updateError'), 'error');
                              }
                          },
                          confirmText: t('editListing.markAsSold'),
                          cancelText: t('common.cancel'),
                          confirmButtonClass: 'bg-green-500 hover:bg-green-600',
                        });
                      }}
                      onPromote={() => {
                        setSelectedListingForPromotion(listing);
                        setShowPromotionModal(true);
                        setPromotionOpenSource('manual');
                        tg?.HapticFeedback.impactOccurred('light');
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
                    className="w-full bg-gray-800/50 hover:bg-gray-700/50 text-white font-semibold py-4 rounded-2xl transition-colors"
                  >
                    {t('sales.showMore')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-white mb-2 font-medium">{t('sales.noListings')}</p>
              <p className="text-sm text-white/70">{t('sales.createFirst')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Кнопки налаштувань */}
      <div className="px-4 py-6 space-y-3">
        <LanguageSwitcher tg={tg} fullWidth />
        
        <button
          onClick={() => {
            const supportManager = process.env.NEXT_PUBLIC_SUPPORT_MANAGER || 'https://t.me/tradeground_support';
            if (tg && tg.openTelegramLink) {
              tg.openTelegramLink(supportManager);
              tg.HapticFeedback?.impactOccurred('medium');
            } else {
              window.location.href = supportManager;
            }
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-transparent rounded-xl border border-white/20 hover:bg-white/10 transition-colors"
        >
          <span className="text-white font-medium">{t('menu.support') || 'Підтримка'}</span>
          <ChevronRight size={20} className="text-white/70" />
        </button>
        
        <button
          onClick={() => {
            router.push(`/${language}/faq`);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-transparent rounded-xl border border-white/20 hover:bg-white/10 transition-colors"
        >
          <span className="text-white font-medium">{t('navigation.faq')}</span>
          <ChevronRight size={20} className="text-white/70" />
        </button>

        <button
          onClick={() => {
            router.push(`/${language}/privacy`);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-transparent rounded-xl border border-white/20 hover:bg-white/10 transition-colors"
        >
          <span className="text-white font-medium">{t('privacy.title')}</span>
          <ChevronRight size={20} className="text-white/70" />
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

      {/* Модальне вікно поповнення балансу */}
      {profile && (
        <TopUpBalanceModal
          isOpen={showTopUpModal}
          onClose={() => setShowTopUpModal(false)}
          telegramId={profile.telegramId}
          currentBalance={profile.balance || 0}
          onSuccess={() => {
            refetch();
            setShowTopUpModal(false);
          }}
          tg={tg}
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
            const updatedProfile = await response.json();
            // Очікуємо завершення refetch перед закриттям модального вікна
            await refetch();
            setIsEditModalOpen(false);
            // Показуємо повідомлення про успішне збереження
            if (tg) {
              tg.showAlert(t('profile.profileUpdated') || 'Профіль оновлено');
            }
          } else {
            const errorData = await response.json();
            console.error('Error updating profile:', errorData);
            if (tg) {
              tg.showAlert(t('profile.saveError') || 'Помилка збереження профілю');
            }
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
            
            // Додаємо нові фото (File об'єкти)
            if (listingData.images && Array.isArray(listingData.images)) {
              listingData.images.forEach((image: File) => {
                if (image instanceof File) {
                  formData.append('images', image);
                }
              });
            }
            
            // Передаємо інформацію про старі зображення, які залишаються
            // imagePreviews містить шляхи до існуючих зображень
            if (listingData.imagePreviews && Array.isArray(listingData.imagePreviews)) {
              // Фільтруємо тільки URL (старі зображення), а не data URLs (нові)
              const existingImageUrls = listingData.imagePreviews.filter(
                (preview: string) => !preview.startsWith('data:')
              );
              
              console.log('[ProfileTab] Existing image URLs to send:', existingImageUrls);
              
              // Передаємо старі зображення як окреме поле для обробки на бекенді
              existingImageUrls.forEach((url: string) => {
                formData.append('existingImages', url);
              });
            }

            console.log('[ProfileTab] Updating listing with status:', listingData.status);

            const response = await fetch(`/api/listings/${editingListing.id}/update`, {
              method: 'PUT',
              body: formData,
            });

            const result = await response.json();
            console.log('[ProfileTab] Update response:', result);

            if (!response.ok) {
              if (result.needsPackage) {
                // Потрібно купити пакет
                showToast(t('payments.needPackage'), 'error');
                setEditingListing(null);
                // Відкриваємо модальне вікно покупки пакету
                // TODO: додати логіку відкриття модального вікна
                return;
              }
              throw new Error(result.error || 'Failed to update listing');
            }

            // Якщо потрібен вибір реклами - відкриваємо модальне вікно реклами
            // НЕ закриваємо модальне вікно редагування, воно закриється після вибору реклами
            if (result.needsPromotionSelection && result.listingId) {
              console.log('[ProfileTab] Opening promotion modal for listing:', result.listingId);
              
              // Закриваємо модальне вікно редагування перед відкриттям модального вікна реклами
              setEditingListing(null);
              
              // Отримуємо оновлене оголошення
              const listingResponse = await fetch(`/api/listings/${result.listingId}`);
              if (listingResponse.ok) {
                const updatedListing = await listingResponse.json();
                setSelectedListingForPromotion(updatedListing);
                // Система сама пропонує рекламу після активації — дозволяємо «Опублікувати без реклами»
                setPromotionOpenSource('auto');
                setShowPromotionModal(true);
              }
            } else {
              // Закриваємо модальне вікно редагування тільки якщо не потрібна реклама
              setEditingListing(null);
              
              if (result.needsModeration) {
                showToast(t('editListing.sentToModeration'), 'success');
              } else {
                showToast(t('editListing.listingUpdated'), 'success');
              }
            }
            
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
            // Оновлюємо сторінку
            router.refresh();
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
              // Оновлюємо сторінку
              router.refresh();
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
        shareText={`👤 Профіль ${profile.firstName} ${profile.lastName} в Trade Ground Marketplace`}
        tg={tg}
      />
      )}

      {/* Модальне вікно підтвердження */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={async () => {
          await confirmModal.onConfirm();
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmButtonClass={confirmModal.confirmButtonClass}
        tg={tg}
      />

      {/* Модальне вікно реклами/апгрейду */}
      {selectedListingForPromotion && (
        <PromotionUpgradeModal
          isOpen={showPromotionModal}
          onClose={() => {
            // Просто закриваємо модальне вікно без відправки на модерацію
            // Оголошення залишається в статусі draft до явного вибору користувача
            setShowPromotionModal(false);
            setSelectedListingForPromotion(null);
            setPromotionOpenSource(null);
          }}
          listingId={selectedListingForPromotion.id}
          currentPromotion={selectedListingForPromotion.promotionType}
          promotionEnds={selectedListingForPromotion.promotionEnds}
          telegramId={profile?.telegramId}
          // Кнопка «Опублікувати без реклами» повинна бути скрізь,
          // ОКРІМ випадку, коли користувач сам натиснув «Рекламувати»
          showSkipButton={promotionOpenSource !== 'manual'}
          onSelectPromotion={async (promotionType, paymentMethod) => {
            try {
              const listingId = selectedListingForPromotion.id;
              
              if (promotionType) {
                // Користувач вибрав рекламу
                const response = await fetch('/api/listings/promotions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    telegramId: profile?.telegramId,
                    listingId: listingId,
                    promotionType,
                    paymentMethod,
                  }),
                });

                const data = await response.json();

                if (!response.ok) {
                  throw new Error(data.error || 'Failed to purchase promotion');
                }

                if (data.paymentRequired && data.pageUrl) {
                  // Використовуємо той самий метод, що й TopUpBalanceModal
                  tg?.HapticFeedback.notificationOccurred('success');
                  showToast(t('payments.paymentInfo'), 'info');
                  
                  // Перенаправляємо на сторінку оплати
                  window.location.href = data.pageUrl;
                  return;
                }
              }

              // Користувач пропустив рекламу АБО успішно оплатив з балансу
              // Перевіряємо чи оголошення потребує відправки на модерацію
              const listingResponse = await fetch(`/api/listings/${listingId}`);
              if (listingResponse.ok) {
                const listing = await listingResponse.json();
                
                // Якщо оголошення НЕ в статусі active або pending_moderation, відправляємо на модерацію
                if (listing.status !== 'active' && listing.status !== 'pending_moderation') {
                  console.log('[ProfileTab] Submitting listing to moderation after promotion selection...');
                  
                  const submitResponse = await fetch(`/api/listings/${listingId}/submit-moderation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      telegramId: profile?.telegramId,
                    }),
                  });

                  const submitData = await submitResponse.json();

                  if (!submitResponse.ok) {
                    throw new Error(submitData.error || 'Failed to submit listing for moderation');
                  }

                  console.log('[ProfileTab] Listing submitted to moderation successfully');
                  showToast(t('editListing.sentToModeration'), 'success');
                } else if (listing.status === 'pending_moderation') {
                  // Оголошення вже на модерації (було відправлено автоматично після оплати реклами)
                  if (promotionType) {
                    showToast(t('promotions.promotionSuccess'), 'success');
                  }
                  showToast(t('editListing.sentToModeration'), 'success');
                } else {
                  // Оголошення вже активне, просто показуємо успішне повідомлення про рекламу
                  if (promotionType) {
                    showToast(t('promotions.promotionSuccess'), 'success');
                  }
                }
              }
              
              tg?.HapticFeedback.notificationOccurred('success');
              // Оновлюємо список оголошень
              await fetchListingsWithFilters(0, true);

              setShowPromotionModal(false);
              setSelectedListingForPromotion(null);
            } catch (error: any) {
              console.error('Error in promotion flow:', error);
              showToast(error.message || t('promotions.promotionError'), 'error');
              tg?.HapticFeedback.notificationOccurred('error');
            }
          }}
        />
      )}

      {/* Модальне вікно реактивації оголошення */}
      {selectedListingForReactivation && (
        <ReactivateListingFlow
          isOpen={showReactivateFlow}
          onClose={() => {
            setShowReactivateFlow(false);
            setSelectedListingForReactivation(null);
          }}
          listingId={selectedListingForReactivation}
          tg={tg}
          onSuccess={async () => {
            showToast(t('editListing.listingReactivated'), 'success');
            tg?.HapticFeedback.notificationOccurred('success');
            // Оновлюємо список оголошень
            await fetchListingsWithFilters(0, true);
            setShowReactivateFlow(false);
            setSelectedListingForReactivation(null);
          }}
        />
      )}

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
