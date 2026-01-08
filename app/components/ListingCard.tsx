import { Heart, Image as ImageIcon } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getCurrencySymbol } from '@/utils/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTimeAgo } from '@/utils/formatTime';

interface ListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
  isSold?: boolean;
  isDeactivated?: boolean;
}

export const ListingCard = ({ listing, isFavorite, onSelect, onToggleFavorite, tg, isSold = false, isDeactivated = false }: ListingCardProps) => {
  const { t } = useLanguage();
  
  // Форматуємо час на клієнті з перекладами
  const formattedTime = useMemo(() => {
    if (listing.createdAt) {
      return formatTimeAgo(listing.createdAt, t);
    }
    return listing.posted || '';
  }, [listing.createdAt, listing.posted, t]);
  const imageLoadedRef = useRef<Set<string>>(new Set());
  
  // Перевіряємо, чи зображення вже завантажене при ініціалізації
  const checkIfImageLoaded = (url: string): boolean => {
    if (!url) return false;
    if (imageLoadedRef.current.has(url)) return true;
    
    // Перевіряємо кеш браузера
    const img = new Image();
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      imageLoadedRef.current.add(url);
      return true;
    }
    return false;
  };

  // Мемоізуємо URL зображення, щоб уникнути зайвих запитів
  const imageUrl = useMemo(() => {
    // Спочатку перевіряємо listing.image, потім listing.images[0]
    const image = listing.image || (listing.images && listing.images.length > 0 ? listing.images[0] : '');
    if (!image) return '';
    if (image?.startsWith('http')) return image;
    const cleanPath = image?.split('?')[0] || image;
    const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
    return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
  }, [listing.image, listing.images]);

  // Ініціалізуємо стан завантаження на основі того, чи зображення вже завантажене
  const [imageLoading, setImageLoading] = useState(() => {
    if (!imageUrl) return false;
    return !checkIfImageLoaded(imageUrl);
  });
  const [imageError, setImageError] = useState(false);

  // Скидаємо стан завантаження при зміні URL зображення
  useEffect(() => {
    if (!imageUrl) {
      setImageLoading(false);
      setImageError(true);
      return;
    }
    
    // Перевіряємо, чи це зображення вже було завантажене раніше
    if (imageLoadedRef.current.has(imageUrl)) {
      setImageLoading(false);
      setImageError(false);
      return;
    }
    
    // Перевіряємо, чи зображення вже в кеші браузера
    const img = new Image();
    let isCancelled = false;
    
    img.onload = () => {
      if (!isCancelled) {
        imageLoadedRef.current.add(imageUrl);
        setImageLoading(false);
        setImageError(false);
      }
    };
    img.onerror = () => {
      if (!isCancelled) {
        setImageLoading(false);
        setImageError(true);
      }
    };
    
    // Встановлюємо src для перевірки кешу
    img.src = imageUrl;
    
    // Якщо зображення вже в кеші, воно завантажиться миттєво
    if (img.complete && img.naturalWidth > 0) {
      imageLoadedRef.current.add(imageUrl);
      setImageLoading(false);
      setImageError(false);
    } else {
      // Зображення ще не завантажене
      setImageLoading(true);
      setImageError(false);
    }
    
    return () => {
      isCancelled = true;
    };
  }, [imageUrl]);

  return (
    <div 
      data-listing-id={listing.id}
      className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer relative select-none ${
        isSold || isDeactivated ? 'opacity-60' : ''
      }`}
      onClick={() => {
        if (!isSold && !isDeactivated) {
          onSelect(listing);
          tg?.HapticFeedback.impactOccurred('light');
        }
      }}
    >
      <div className="relative aspect-square bg-gray-100 overflow-hidden w-full">
        {/* Placeholder або зображення */}
        {imageError || (!listing.image && (!listing.images || listing.images.length === 0)) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 w-full h-full">
            <div className="text-center">
              <ImageIcon size={48} className="text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">{t('listing.noImages')}</p>
            </div>
          </div>
        ) : (
            <img 
              src={imageUrl}
              alt={listing.title}
            className={`absolute inset-0 w-full h-full min-w-full min-h-full object-cover ${
                imageLoading ? 'opacity-0 transition-opacity duration-300' : 'opacity-100'
            } ${isSold || isDeactivated ? 'grayscale' : ''}`}
            style={{ width: '100%', height: '100%' }}
              loading="lazy"
              decoding="async"
              sizes="(max-width: 768px) 50vw, 33vw"
              key={`${listing.image}-${listing.id}`}
              onLoad={() => {
                imageLoadedRef.current.add(imageUrl);
                setImageLoading(false);
                setImageError(false);
              }}
              onError={(e) => {
                setImageLoading(false);
                setImageError(true);
                console.error('Error loading listing image:', listing.image);
              }}
            />
        )}
        {/* Бейдж "Продано" або "Деактивовано" */}
        {isSold && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-1 bg-gray-800 text-white text-xs font-semibold rounded-full shadow-md">
              {t('listing.sold')}
            </span>
          </div>
        )}
        {isDeactivated && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-1 bg-orange-600 text-white text-xs font-semibold rounded-full shadow-md">
              {t('sales.deactivated')}
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
            <span className="text-xl font-bold text-gray-900">{getCurrencySymbol(listing.currency)}</span>
          )}
        </div>
        
        <p className="text-sm text-gray-700 line-clamp-2 mb-2">{listing.title}</p>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="truncate">{listing.location.split(',')[0]}</span>
          <span>{formattedTime}</span>
        </div>
      </div>
    </div>
  );
};

