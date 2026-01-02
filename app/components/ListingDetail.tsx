import { ArrowLeft, Heart, Share2, MessageCircle, Phone, User, Eye, MapPin, Clock, X, Copy } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ImageGallery } from './ImageGallery';
import { ListingCard } from './ListingCard';
import { getAvatarColor } from '@/utils/avatarColors';
import { useState, useEffect } from 'react';

interface ListingDetailProps {
  listing: Listing;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: (id: number) => void;
  onSelectListing?: (listing: Listing) => void;
  onViewSellerProfile?: (telegramId: string, name: string, avatar: string, username?: string, phone?: string) => void;
  favorites: Set<number>;
  tg: TelegramWebApp | null;
}

export const ListingDetail = ({ 
  listing, 
  isFavorite, 
  onClose, 
  onToggleFavorite,
          onSelectListing,
          onViewSellerProfile,
          favorites,
          tg 
}: ListingDetailProps) => {
  const sellerUsername = listing.seller.username;
  const sellerPhone = listing.seller.phone;
  const images = listing.images || [listing.image];
  const [sellerListings, setSellerListings] = useState<Listing[]>([]);
  const [categoryListings, setCategoryListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState(listing.views);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sellerHasMore, setSellerHasMore] = useState(false);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [sellerOffset, setSellerOffset] = useState(0);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [sellerTotal, setSellerTotal] = useState(0);
  const [categoryTotal, setCategoryTotal] = useState(0);

  // Скролимо нагору при відкритті нового оголошення
  useEffect(() => {
    // Невелика затримка для забезпечення рендерингу
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }, [listing.id]);

  // Фіксуємо перегляд при відкритті оголошення
  useEffect(() => {
    const recordView = async () => {
      try {
        const response = await fetch(`/api/listings/${listing.id}`, {
          method: 'GET',
        });
        if (response.ok) {
          const updatedListing = await response.json();
          setViews(updatedListing.views);
        }
      } catch (error) {
        console.error('Error recording view:', error);
      }
    };

    recordView();
  }, [listing.id]);

  useEffect(() => {
    const fetchRelatedListings = async () => {
      try {
        setLoading(true);
        // Завантажуємо оголошення продавця
        if (listing.seller.telegramId) {
          const sellerResponse = await fetch(`/api/listings?userId=${listing.seller.telegramId}&limit=16&offset=0`);
          if (sellerResponse.ok) {
            const sellerData = await sellerResponse.json();
            const filtered = (sellerData.listings || []).filter((l: Listing) => l.id !== listing.id);
            setSellerListings(filtered);
            setSellerTotal(sellerData.total || 0);
            setSellerHasMore(filtered.length < ((sellerData.total || 0) - 1));
            setSellerOffset(16);
          }
        }
        
        // Завантажуємо оголошення з категорії
        const categoryResponse = await fetch(`/api/listings?category=${listing.category}&limit=16&offset=0`);
        if (categoryResponse.ok) {
          const categoryData = await categoryResponse.json();
          const filtered = (categoryData.listings || []).filter((l: Listing) => l.id !== listing.id);
          setCategoryListings(filtered);
          setCategoryTotal(categoryData.total || 0);
          setCategoryHasMore(filtered.length < ((categoryData.total || 0) - 1));
          setCategoryOffset(16);
        }
      } catch (error) {
        console.error('Error fetching related listings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedListings();
  }, [listing.id, listing.seller.telegramId, listing.category, listing.price, listing.isFree]);

  const loadMoreSellerListings = async () => {
    if (!listing.seller.telegramId) return;
    try {
      const response = await fetch(`/api/listings?userId=${listing.seller.telegramId}&limit=16&offset=${sellerOffset}`);
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.listings || []).filter((l: Listing) => l.id !== listing.id);
        setSellerListings(prev => [...prev, ...filtered]);
        setSellerHasMore((sellerOffset + filtered.length) < ((data.total || 0) - 1));
        setSellerOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
      }
    } catch (error) {
      console.error('Error loading more seller listings:', error);
    }
  };

  const loadMoreCategoryListings = async () => {
    try {
      const response = await fetch(`/api/listings?category=${listing.category}&limit=16&offset=${categoryOffset}`);
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.listings || []).filter((l: Listing) => l.id !== listing.id);
        setCategoryListings(prev => [...prev, ...filtered]);
        setCategoryHasMore((categoryOffset + filtered.length) < ((data.total || 0) - 1));
        setCategoryOffset(prev => prev + 16);
        tg?.HapticFeedback.impactOccurred('light');
      }
    } catch (error) {
      console.error('Error loading more category listings:', error);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20" style={{ position: 'relative' }}>
      {/* Хедер */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <button 
          onClick={() => {
            onClose();
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-900" />
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onToggleFavorite(listing.id);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <Heart 
              size={20} 
              className={isFavorite ? 'text-red-500' : 'text-gray-600'}
              fill={isFavorite ? 'currentColor' : 'none'}
            />
          </button>
          <button 
            onClick={() => {
              if (tg) {
                const botUrl = process.env.NEXT_PUBLIC_BOT_URL || 'https://t.me/your_bot';
                const shareLink = `${botUrl}?start=listing_${listing.id}`;
                tg.openTelegramLink(shareLink);
                tg.HapticFeedback.impactOccurred('light');
              }
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <Share2 size={20} className="text-gray-900" />
          </button>
        </div>
      </div>

      {/* Галерея фото */}
      <ImageGallery images={images} title={listing.title} />

      {/* Контент */}
      <div className="p-4">
        {/* Ціна */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-gray-900 mb-1">{listing.price}</div>
        </div>

        {/* Заголовок */}
        <h1 className="text-xl font-semibold text-gray-900 mb-4">{listing.title}</h1>

        {/* Статистика */}
        <div className="flex gap-4 mb-6 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <Eye size={16} className="text-gray-400" />
            <span>{views} переглядів</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin size={16} className="text-gray-400" />
            <span>{listing.location}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={16} className="text-gray-400" />
            <span>{listing.posted}</span>
          </div>
        </div>

        {/* Опис */}
        <div className="mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">Опис</h2>
          <p className="text-gray-700 whitespace-pre-line leading-relaxed">{listing.description}</p>
        </div>

        {/* Продавець */}
        <div className="border border-gray-200 rounded-2xl p-4 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Продавець</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 relative">
              {listing.seller.avatar && (listing.seller.avatar.startsWith('/') || listing.seller.avatar.startsWith('http')) ? (
                <>
                  <div className="absolute inset-0 animate-pulse bg-gray-200" />
                  <img 
                    src={listing.seller.avatar} 
                    alt={listing.seller.name}
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
                  <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(listing.seller.name)} text-white text-xl font-bold relative z-10`}>
                    {listing.seller.name.charAt(0).toUpperCase()}
                  </div>
                </>
              ) : (
                <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(listing.seller.name)} text-white text-xl font-bold`}>
                  {listing.seller.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-lg mb-1">{listing.seller.name}</p>
              {listing.seller.username && (
                <p className="text-sm text-gray-500 mb-1">@{listing.seller.username}</p>
              )}
            </div>
          </div>
          {onViewSellerProfile && listing.seller.telegramId && (
            <button 
              onClick={() => {
                onViewSellerProfile(
                  listing.seller.telegramId!, 
                  listing.seller.name, 
                  listing.seller.avatar,
                  sellerUsername || undefined,
                  sellerPhone || undefined
                );
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-full px-4 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <User size={18} />
              Переглянути профіль
            </button>
          )}
        </div>

        {/* Інші оголошення продавця */}
        {sellerListings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Інші оголошення продавця</h2>
            <div className="grid grid-cols-2 gap-3">
              {sellerListings.map(sellerListing => (
                <ListingCard 
                  key={sellerListing.id} 
                  listing={sellerListing}
                  isFavorite={favorites.has(sellerListing.id)}
                  onSelect={(l) => {
                    if (onSelectListing) {
                      onSelectListing(l);
                    }
                  }}
                  onToggleFavorite={onToggleFavorite}
                  tg={tg}
                />
              ))}
            </div>
            {sellerHasMore && (
              <div className="mt-4">
                <button
                  onClick={loadMoreSellerListings}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
                >
                  Показати більше
                </button>
              </div>
            )}
          </div>
        )}

        {/* Оголошення з категорії */}
        {categoryListings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Схожі товари</h2>
            <div className="grid grid-cols-2 gap-3">
              {categoryListings.map(categoryListing => (
                <ListingCard 
                  key={categoryListing.id} 
                  listing={categoryListing}
                  isFavorite={favorites.has(categoryListing.id)}
                  onSelect={(l) => {
                    if (onSelectListing) {
                      onSelectListing(l);
                    }
                  }}
                  onToggleFavorite={onToggleFavorite}
                  tg={tg}
                />
              ))}
            </div>
            {categoryHasMore && (
              <div className="mt-4">
                <button
                  onClick={loadMoreCategoryListings}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-4 rounded-2xl transition-colors"
                >
                  Показати більше
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальне вікно для номера телефону */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPhoneModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-slide-up shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Номер телефону</h3>
              <button
                onClick={() => {
                  setShowPhoneModal(false);
                  setCopied(false);
                }}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={20} className="text-gray-900" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-2xl font-semibold text-gray-900 text-center mb-6">
                {sellerPhone || listing.seller.phone}
              </p>
              {copied && (
                <div className="mb-4 text-center">
                  <p className="text-green-600 font-semibold">Скопійовано!</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const phone = sellerPhone || listing.seller.phone;
                    if (phone) {
                      window.location.href = `tel:${phone}`;
                    }
                    tg?.HapticFeedback.impactOccurred('medium');
                  }}
                  className="flex-1 bg-gray-100 text-blue-600 py-4 rounded-2xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer border border-gray-200"
                >
                  <Phone size={20} />
                  Подзвонити
                </button>
                <button
                  onClick={() => {
                    const phone = sellerPhone || listing.seller.phone;
                    if (phone && navigator.clipboard) {
                      navigator.clipboard.writeText(phone);
                      setCopied(true);
                      tg?.HapticFeedback.impactOccurred('medium');
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="flex-1 bg-[#6366F1] text-white py-4 rounded-full font-semibold hover:bg-[#4F46E5] transition-colors flex items-center justify-center gap-2 shadow-md"
                >
                  <Copy size={20} />
                  Скопіювати
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Нижня панель з кнопками */}
      <div className="fixed bottom-20 left-0 right-0 p-4 z-[60] max-w-2xl mx-auto" style={{ pointerEvents: 'auto' }}>
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-4 flex gap-3">
          <button 
            type="button"
            onClick={() => {
              const phone = sellerPhone || listing.seller.phone;
              if (phone) {
                setShowPhoneModal(true);
                tg?.HapticFeedback.impactOccurred('medium');
              } else {
                tg?.showAlert('Номер телефону не вказано');
                tg?.HapticFeedback.impactOccurred('medium');
              }
            }}
            className="flex-1 bg-gray-100 text-blue-600 py-4 rounded-2xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer border border-gray-200"
          >
            <Phone size={20} />
            Зателефонувати
          </button>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const telegramId = listing.seller.telegramId;
              const username = listing.seller.username;
              console.log('Написати clicked, telegramId:', telegramId, 'username:', username, 'listing.seller:', listing.seller);
              
              let link = '';
              
              if (username) {
                // Якщо є username, використовуємо його
                link = `https://t.me/${username}`;
              } else if (telegramId && String(telegramId).trim() !== '') {
                // Використовуємо tg://user?id= для відкриття чату з користувачем за ID
                link = `tg://user?id=${telegramId}`;
              } else {
                console.log('Telegram ID and username not found');
                if (tg) {
                  tg.showAlert('Telegram ID не знайдено');
                } else {
                  alert('Telegram ID не знайдено');
                }
                return;
              }
              
              console.log('Opening Telegram link:', link);
              
              // Якщо Telegram WebApp доступний, використовуємо його
              if (tg && tg.openTelegramLink) {
                tg.openTelegramLink(link);
                tg.HapticFeedback?.impactOccurred('medium');
              } else {
                // Якщо ні, відкриваємо посилання через звичайний браузер
                window.location.href = link;
              }
            }}
            className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle size={20} />
            Написати
          </button>
        </div>
      </div>
    </div>
  );
};

