import { Heart, Image as ImageIcon } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useState } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { useLanguage } from '@/contexts/LanguageContext';

interface ListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
  isSold?: boolean;
}

export const ListingCard = ({ listing, isFavorite, onSelect, onToggleFavorite, tg, isSold = false }: ListingCardProps) => {
  const { t } = useLanguage();
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  return (
    <div 
      className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer relative select-none ${
        isSold ? 'opacity-60' : ''
      }`}
      onClick={() => {
        if (!isSold) {
          onSelect(listing);
          tg?.HapticFeedback.impactOccurred('light');
        }
      }}
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
          <div className="absolute inset-0 flex items-center justify-center">
            <img 
              src={(() => {
                if (listing.image?.startsWith('http')) return listing.image;
                const cleanPath = listing.image?.split('?')[0] || listing.image;
                const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
                return `/api/images/${pathWithoutSlash}?t=${Date.now()}`;
              })()}
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
          </div>
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
        <div className="mb-1 flex items-center gap-1">
          <span className={`text-xl font-bold ${listing.isFree ? 'text-green-600' : 'text-gray-900'}`}>
            {listing.isFree ? t('common.free') : listing.price}
          </span>
          {!listing.isFree && listing.currency && (
            <span className="text-lg text-gray-600">{getCurrencySymbol(listing.currency)}</span>
          )}
        </div>
        
        <p className="text-sm text-gray-700 line-clamp-2 mb-2">{listing.title}</p>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="truncate">{listing.location.split(',')[0]}</span>
          <span>{listing.posted}</span>
        </div>
      </div>
    </div>
  );
};

