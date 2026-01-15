import { Heart, ArrowRight } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from '../ListingCard';
import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface FavoritesTabProps {
  listings: Listing[];
  favorites: Set<number>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  onNavigateToCatalog?: () => void;
  tg: TelegramWebApp | null;
}

export const FavoritesTab = ({
  listings,
  favorites,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSelectListing,
  onToggleFavorite,
  onNavigateToCatalog,
  tg
}: FavoritesTabProps) => {
  const { t } = useLanguage();
  const favoritedListings = listings.filter(l => favorites.has(l.id));
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartScrollY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartScrollY.current = window.scrollY || document.documentElement.scrollTop;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null || touchStartScrollY.current === null) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    const currentScrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollDelta = Math.abs(currentScrollY - touchStartScrollY.current);
    
    // Якщо це вертикальний скрол або свайп не з лівого краю, запобігаємо свайпу назад
    if (Math.abs(deltaY) > Math.abs(deltaX) || scrollDelta > 5 || touchStartX.current > 20) {
      // Це вертикальний скрол, дозволяємо його
      return;
    }
    
    // Якщо свайп з лівого краю вправо (свайп назад), запобігаємо йому
    if (touchStartX.current <= 20 && deltaX > 0 && Math.abs(deltaY) < 30) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;
    touchStartScrollY.current = null;
  };
  
  if (favoritedListings.length === 0) {
    return (
      <div 
        className="pb-24 flex flex-col h-screen overflow-hidden px-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        <h2 className="text-2xl font-bold text-white mb-2 pt-2">Обране</h2>
        <p className="text-sm text-gray-400 mb-8">Тут товари, які вам сподобалися</p>
        
        <div className="flex-1 flex items-start justify-center pt-8 pb-20">
          <div className="max-w-sm mx-auto px-4">
            <div className="border-2 border-gray-600 rounded-3xl p-8 text-center">
              <div className="flex items-center justify-center mx-auto mb-6">
                <Heart size={64} className="text-white" fill="none" strokeWidth={2} />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">У вас ще немає обраних</h3>
              <p className="text-sm text-gray-400">Додайте товари до списку обраного, щоб швидко знаходити улюблене</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="pb-24"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="p-4 pt-2">
        <h2 className="text-2xl font-bold text-white mb-2">Обране</h2>
        <p className="text-sm text-gray-400 mb-4">Тут товари, які вам сподобалися</p>
        
        <div className="grid grid-cols-2 gap-4">
          {favoritedListings.map(listing => (
            <ListingCard 
              key={listing.id} 
              listing={listing}
              isFavorite={favorites.has(listing.id)}
              onSelect={onSelectListing}
              onToggleFavorite={onToggleFavorite}
              tg={tg}
            />
          ))}
        </div>
        
        {hasMore && (
          <div className="px-4 py-4 text-center">
            {loadingMore ? (
              <div className="text-gray-400 text-sm">{t('common.loading')}</div>
            ) : (
              onLoadMore && (
                <button
                  onClick={() => {
                    onLoadMore();
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-white text-white bg-transparent hover:bg-white/10 transition-colors"
                >
                  {t('common.showMore')}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

