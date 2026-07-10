'use client';

import { useCallback, useMemo } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { ListingCard } from '@/components/listing/ListingCard';
import { ListingCardColumn } from '@/components/listing/ListingCardColumn';

type Props = {
  listings: Listing[];
  viewMode: 'grid' | 'list';
  favorites: Set<number>;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  tg: TelegramWebApp | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  isLight: boolean;
};

/** ~12–24 видимих карток + overscan; window scroll для Telegram WebView. */
export function BazaarListingsVirtualFeed({
  listings,
  viewMode,
  favorites,
  onSelectListing,
  onToggleFavorite,
  tg,
  hasMore,
  loadingMore,
  onLoadMore,
  isLight,
}: Props) {
  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore && onLoadMore) onLoadMore();
  }, [hasMore, loadingMore, onLoadMore]);

  const Footer = useCallback(() => {
    if (!hasMore && !loadingMore) return null;
    return (
      <div className="flex justify-center px-4 py-6 pb-24">
        {loadingMore && (
          <div
            className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
              isLight
                ? 'border-[#3F5331]/30 border-t-[#3F5331]'
                : 'border-white/20 border-t-[#C8E6A0]'
            }`}
          />
        )}
      </div>
    );
  }, [hasMore, loadingMore, isLight]);

  const gridComponents = useMemo(
    () => ({
      List: (({ style, children, ...props }: any) => (
        <div
          {...props}
          style={style}
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [grid-auto-rows:1fr]"
        >
          {children}
        </div>
      )) as any,
      Item: (({ children, ...props }: any) => (
        <div {...props} className="min-h-0 h-full">
          {children}
        </div>
      )) as any,
      Footer,
    }),
    [Footer]
  );

  if (viewMode === 'grid') {
    return (
      <div className="px-4 sm:px-6 pb-4 w-full max-w-[1680px] mx-auto">
        <VirtuosoGrid
          useWindowScroll
          totalCount={listings.length}
          overscan={800}
          endReached={handleEndReached}
          components={gridComponents}
          itemContent={(index) => {
            const listing = listings[index];
            if (!listing) return null;
            return (
              <ListingCard
                listing={listing}
                isFavorite={favorites.has(listing.id)}
                onSelect={onSelectListing}
                onToggleFavorite={onToggleFavorite}
                tg={tg}
                priority={index < 4}
              />
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <Virtuoso
        useWindowScroll
        data={listings}
        overscan={600}
        endReached={handleEndReached}
        components={{ Footer }}
        itemContent={(index, listing) => (
          <div className="pb-3">
            <ListingCardColumn
              listing={listing}
              isFavorite={favorites.has(listing.id)}
              onSelect={onSelectListing}
              onToggleFavorite={onToggleFavorite}
              tg={tg}
            />
          </div>
        )}
      />
    </div>
  );
}
