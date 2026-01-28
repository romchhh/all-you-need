import { Heart, Image as ImageIcon } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useMemo, useEffect, useRef, memo } from 'react';
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

const ListingCardComponent = ({ listing, isFavorite, onSelect, onToggleFavorite, tg, isSold = false, isDeactivated = false }: ListingCardProps) => {
  const { t } = useLanguage();
  
  // Перевіряємо чи оголошення має активну рекламу
  const hasPromotion = listing.promotionType && listing.promotionEnds 
    ? new Date(listing.promotionEnds) > new Date() 
    : false;
  
  // Парсимо promotionType - може бути одним типом або комбінацією "highlighted,top_category"
  const promotionTypes = hasPromotion && listing.promotionType
    ? listing.promotionType.split(',').map(t => t.trim())
    : [];
  
  const promotionType = promotionTypes.length > 0 ? promotionTypes[0] : null;
  
  // Логування для діагностики
  useEffect(() => {
    if (listing.promotionType) {
      console.log('Listing promotion data:', {
        id: listing.id,
        promotionType: listing.promotionType,
        promotionEnds: listing.promotionEnds,
        hasPromotion,
        now: new Date().toISOString(),
        endsAt: listing.promotionEnds ? new Date(listing.promotionEnds).toISOString() : null,
        isExpired: listing.promotionEnds ? new Date(listing.promotionEnds) <= new Date() : null
      });
    }
  }, [listing.id, listing.promotionType, listing.promotionEnds]);
  
  // Визначаємо стилі в залежності від типу реклами
  // Правила:
  // - ТОП (top_category) - без рамки (тільки бейдж, якщо немає іншої реклами)
  // - Выделение цветом (highlighted) - рамка без бейджа
  // - ВИП (vip) - рамка + бейдж VIP
  // - ТОП + Выделение - рамка + бейдж TOP
  const getPromotionStyles = () => {
    if (promotionTypes.length === 0) return 'border border-white/20';
    
    // Якщо є VIP - показуємо VIP стиль
    if (promotionTypes.includes('vip')) {
      return 'border-2 border-[#D3F1A7] shadow-[0_0_20px_rgba(211,241,167,0.4)]';
    }
    
    // Якщо є highlighted - показуємо рамку
    if (promotionTypes.includes('highlighted')) {
      return 'border-2 border-[#D3F1A7]';
    }
    
    // Якщо тільки top_category - без рамки
    if (promotionTypes.includes('top_category')) {
      return 'border border-white/20';
    }
    
    return 'border border-white/20';
  };
  
  const getPromotionBadge = () => {
    // Якщо є VIP - показуємо VIP бейдж
    if (promotionTypes.includes('vip')) {
      return (
        <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          VIP
        </div>
      );
    }
    
    // Якщо є top_category - показуємо TOP бейдж
    if (promotionTypes.includes('top_category')) {
      return (
        <div className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          TOP
        </div>
      );
    }
    
    // highlighted - без бейджа (тільки рамка)
    return null;
  };
  
  const getCardBackgroundStyles = () => {
    return 'bg-[#000000]';
  };
  
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
      className={`${getCardBackgroundStyles()} rounded-2xl transition-all cursor-pointer relative select-none flex flex-col ${
        isSold || isDeactivated ? 'opacity-60' : ''
      } ${getPromotionStyles()}`}
      style={{ height: '100%', minHeight: '350px', overflow: 'visible' }}
      onClick={() => {
        if (!isSold && !isDeactivated) {
          onSelect(listing);
          tg?.HapticFeedback.impactOccurred('light');
        }
      }}
    >
      {/* Зображення товару - займає більшу частину картки */}
      <div className="relative w-full flex-shrink-0 rounded-t-2xl overflow-hidden" style={{ height: '240px', minHeight: '240px', maxHeight: '240px', zIndex: 1 }}>
        {/* Бейдж реклами (VIP/TOP) - лівий верхній кут */}
        <div className="absolute top-3 left-3 z-10" style={{ width: 'auto', maxWidth: 'fit-content' }}>
          {getPromotionBadge()}
        </div>
        
        {/* Placeholder або зображення */}
        {imageError || (!listing.image && (!listing.images || listing.images.length === 0)) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A] w-full h-full">
            <div className="text-center">
              <ImageIcon size={48} className="text-white/10 mx-auto" />
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
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-2 py-1 bg-gray-800/90 text-white text-xs font-semibold rounded-full shadow-md">
              {t('listing.sold')}
            </span>
          </div>
        )}
        {isDeactivated && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-2 py-1 bg-orange-600/90 text-white text-xs font-semibold rounded-full shadow-md">
              {t('sales.deactivated')}
            </span>
          </div>
        )}
        
        {/* Кнопка лайку - правий верхній кут */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full border border-white/30 hover:bg-black/60 transition-all z-10"
        >
          <Heart 
            size={16} 
            className={isFavorite ? 'text-white fill-white' : 'text-white'}
            fill={isFavorite ? 'currentColor' : 'none'}
            strokeWidth={isFavorite ? 0 : 2}
          />
        </button>
      </div>
      
      {/* Темний overlay з інформацією - нижня частина з заокругленими верхніми кутами */}
      <div className="relative bg-gradient-to-b from-[#1A1A1A]/95 to-[#0A0A0A]/95 rounded-t-3xl rounded-b-2xl -mt-5 pt-3 px-4 pb-1.5 flex flex-col flex-1 z-30" style={{ minHeight: '110px', position: 'relative', zIndex: 30 }}>
        {/* Ціна та тег стану */}
        <div className="flex items-start justify-between gap-2 mb-1 min-h-[1.5rem]">
          <div className="min-w-0 flex-1">
          {(() => {
            const isNegotiable = listing.price === t('common.negotiable') || listing.price === 'Договірна' || listing.price === 'Договорная';
            const isFree = listing.isFree;
            
            if (isFree) {
              return <span className="font-bold text-white text-2xl truncate block">{t('common.free')}</span>;
            }
            
            if (isNegotiable) {
              return <span className="font-bold text-white text-base truncate block" title={t('common.negotiable')}>{t('common.negotiable')}</span>;
            }
            
            return <span className="font-bold text-white text-2xl truncate block">{`${listing.price}${getCurrencySymbol(listing.currency)}`}</span>;
          })()}
          </div>
          {listing.condition && (
            <span className="px-2.5 py-1 bg-[#2A2A2A] text-white text-[11px] font-semibold rounded flex-shrink-0">
              {listing.condition === 'new' ? t('listing.condition.new') : t('listing.condition.used')}
            </span>
          )}
        </div>
        
        {/* Назва товару */}
        <p className="text-sm text-white line-clamp-2 mb-0.5 font-medium leading-snug">
          {listing.title}
        </p>
        
        {/* Локація та час */}
        <div className="flex flex-col gap-0.5 text-[10px] text-white/60 mt-0.5 mb-0">
          <div className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60 flex-shrink-0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span className="truncate">{listing.location?.split(',')[0] || ''}</span>
          </div>
          <div className="text-white/60 truncate">
            {formattedTime}
          </div>
        </div>
      </div>
    </div>
  );
};

// Мемоізуємо компонент для оптимізації ререндерів
export const ListingCard = memo(ListingCardComponent, (prevProps, nextProps) => {
  // Перевіряємо, чи змінилися важливі пропси
  return (
    prevProps.listing.id === nextProps.listing.id &&
    prevProps.listing.image === nextProps.listing.image &&
    prevProps.listing.price === nextProps.listing.price &&
    prevProps.listing.title === nextProps.listing.title &&
    prevProps.listing.promotionType === nextProps.listing.promotionType &&
    prevProps.listing.promotionEnds === nextProps.listing.promotionEnds &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.isSold === nextProps.isSold &&
    prevProps.isDeactivated === nextProps.isDeactivated
  );
});
