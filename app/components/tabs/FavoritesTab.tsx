import { Heart, ArrowRight } from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from '../ListingCard';

interface FavoritesTabProps {
  listings: Listing[];
  favorites: Set<number>;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  onPreviewListing?: (listing: Listing) => void;
  onNavigateToCatalog?: () => void;
  tg: TelegramWebApp | null;
}

export const FavoritesTab = ({
  listings,
  favorites,
  onSelectListing,
  onToggleFavorite,
  onPreviewListing,
  onNavigateToCatalog,
  tg
}: FavoritesTabProps) => {
  const favoritedListings = listings.filter(l => favorites.has(l.id));
  
  if (favoritedListings.length === 0) {
    return (
      <div className="pb-24 flex items-center justify-center min-h-screen bg-white">
        <div className="text-center px-4">
          <div className="flex items-center justify-center mx-auto mb-4">
            <Heart size={48} className="text-gray-400" fill="none" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ви ще нічого не додали в обране</h2>
          <p className="text-gray-500 mb-6">Натисніть ❤️ на товарах, які сподобались, щоб зберегти їх тут</p>
          {onNavigateToCatalog && (
            <button
              onClick={() => {
                onNavigateToCatalog();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
            >
              До каталогу
              <ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="pb-24">
      <div className="p-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Обране</h2>
        <p className="text-sm text-gray-500 mb-4">Тут товари, які вам сподобалися</p>
        
        <div className="grid grid-cols-2 gap-4">
          {favoritedListings.map(listing => (
            <ListingCard 
              key={listing.id} 
              listing={listing}
              isFavorite={favorites.has(listing.id)}
              onSelect={onSelectListing}
              onToggleFavorite={onToggleFavorite}
              onPreview={onPreviewListing}
              tg={tg}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

