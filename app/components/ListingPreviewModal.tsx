import { X, Heart, MapPin, Eye } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ImageGallery } from './ImageGallery';
import { getAvatarColor } from '@/utils/avatarColors';
import { useMemo } from 'react';

interface ListingPreviewModalProps {
  isOpen: boolean;
  listing: Listing | null;
  isFavorite: boolean;
  onClose: () => void;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
}

export const ListingPreviewModal = ({
  isOpen,
  listing,
  isFavorite,
  onClose,
  onSelect,
  onToggleFavorite,
  tg
}: ListingPreviewModalProps) => {
  if (!isOpen || !listing) return null;

  const sellerName = listing.seller.name || 'Користувач';

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto relative animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Хедер */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-gray-900 truncate flex-1">{listing.title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-900 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Галерея */}
        <div className="relative">
          <ImageGallery 
            images={listing.images || [listing.image]} 
            title={listing.title}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(listing.id);
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform active:scale-95 z-20"
          >
            <Heart 
              size={20} 
              className={isFavorite ? 'text-red-500' : 'text-gray-600'}
              fill={isFavorite ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* Інформація */}
        <div className="p-4 space-y-3">
          {/* Ціна */}
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-bold ${listing.isFree ? 'text-green-600' : 'text-gray-900'}`}>
              {listing.isFree ? 'Безкоштовно' : listing.price}
            </span>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Eye size={16} />
              <span>{listing.views}</span>
            </div>
          </div>

          {/* Назва */}
          <h2 className="text-xl font-bold text-gray-900">{listing.title}</h2>

          {/* Опис */}
          <p className="text-gray-700 text-sm line-clamp-3">{listing.description}</p>

          {/* Локація */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin size={16} />
            <span>{listing.location}</span>
          </div>

          {/* Продавець */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
              {listing.seller.avatar && (listing.seller.avatar.startsWith('/') || listing.seller.avatar.startsWith('http')) ? (
                <img 
                  src={(() => {
                    if (listing.seller.avatar?.startsWith('http')) return listing.seller.avatar;
                    const cleanPath = listing.seller.avatar?.split('?')[0] || listing.seller.avatar;
                    const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
                    return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
                  })()}
                  alt={sellerName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(sellerName)} text-white text-xs font-bold`}>
                  {sellerName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-sm font-medium text-gray-900">{sellerName}</span>
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3">
          <button
            onClick={() => {
              onClose();
              setTimeout(() => onSelect(listing), 100);
            }}
            className="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 transition-colors"
          >
            Відкрити деталі
          </button>
        </div>
      </div>
    </div>
  );
};

