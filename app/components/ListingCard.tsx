import { Heart, Image as ImageIcon } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useState } from 'react';
import { useLongPress } from '@/hooks/useLongPress';
import { getAvatarColor } from '@/utils/avatarColors';

interface ListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  onPreview?: (listing: Listing) => void;
  tg: TelegramWebApp | null;
  isSold?: boolean;
}

export const ListingCard = ({ listing, isFavorite, onSelect, onToggleFavorite, onPreview, tg, isSold = false }: ListingCardProps) => {
  const sellerName = listing.seller.name || 'Користувач';
  const sellerAvatar = listing.seller.avatar || '👤';
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const longPressHandlers = useLongPress({
    onLongPress: () => {
      if (!isSold && onPreview) {
        onPreview(listing);
        tg?.HapticFeedback.impactOccurred('medium');
      }
    },
    onClick: () => {
      if (!isSold) {
        onSelect(listing);
        tg?.HapticFeedback.impactOccurred('light');
      }
    },
    delay: 500,
  });

  return (
    <div 
      className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer relative select-none ${
        isSold ? 'opacity-60' : ''
      }`}
      {...longPressHandlers}
    >
      <div className="relative aspect-square bg-gray-100">
        {/* Skeleton loader */}
        {imageLoading && !imageError && (
          <div className="absolute inset-0 animate-pulse bg-gray-200" />
        )}
        
        {/* Placeholder або зображення */}
        {imageError || !listing.image ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <ImageIcon size={48} className="text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Немає фото</p>
            </div>
          </div>
        ) : (
          <img 
            src={listing.image?.startsWith('http') ? listing.image : listing.image?.startsWith('/') ? listing.image : `/${listing.image}`} 
            alt={listing.title}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            } ${isSold ? 'grayscale' : ''}`}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 768px) 50vw, 33vw"
            key={`${listing.image}-${listing.id}`}
            onLoad={() => setImageLoading(false)}
            onError={(e) => {
              setImageLoading(false);
              setImageError(true);
              console.error('Error loading listing image:', listing.image);
            }}
          />
        )}
        {/* Бейдж "Продано" */}
        {isSold && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-1 bg-gray-800 text-white text-xs font-semibold rounded-full shadow-md">
              Продано
            </span>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="absolute top-2 right-2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform active:scale-95"
        >
          <Heart 
            size={20} 
            className={isFavorite ? 'text-red-500' : 'text-gray-600'}
            fill={isFavorite ? 'currentColor' : 'none'}
          />
        </button>
      </div>
      
      <div className="p-3">
        <div className="mb-1">
          <span className={`text-xl font-bold ${listing.isFree ? 'text-green-600' : 'text-gray-900'}`}>
            {listing.isFree ? 'Безкоштовно' : listing.price}
          </span>
        </div>
        
        <p className="text-sm text-gray-700 line-clamp-2 mb-2">{listing.title}</p>
        
        {/* Власник оголошення */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 border border-gray-300 relative">
            {sellerAvatar && (sellerAvatar.startsWith('/') || sellerAvatar.startsWith('http')) ? (
              <>
                <div className="absolute inset-0 animate-pulse bg-gray-200" />
                <img 
                  src={sellerAvatar} 
                  alt={sellerName}
                  className="w-full h-full object-cover relative z-10"
                  loading="lazy"
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
                <div className={`hidden avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(sellerName)} text-white text-xs font-bold relative z-10`}>
                  {sellerName.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(sellerName)} text-white text-xs font-bold`}>
                {sellerName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-600 truncate flex-1">{sellerName}</span>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="truncate">{listing.location.split(',')[0]}</span>
          <span>{listing.posted}</span>
        </div>
      </div>
    </div>
  );
};

