'use client';

import { useState } from 'react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { shortenCoverTitle } from '@/lib/listings/autoCover';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { ListingAutoCover } from '@/components/listing/ListingAutoCover';

interface SimilarListingsStripProps {
  listings: Listing[];
  isLight: boolean;
  onSelect?: (listing: Listing) => void;
  onSeeMore: () => void;
  tg?: TelegramWebApp | null;
  /** Скільки мініатюр показати перед карткою «ще». */
  maxVisible?: number;
}

function SimilarThumb({
  item,
  onSelect,
  tg,
  thumbSize,
}: {
  item: Listing;
  onSelect?: (listing: Listing) => void;
  tg?: TelegramWebApp | null;
  thumbSize: string;
}) {
  const imageSrc = resolveListingCardImageUrl(item);
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(imageSrc) && !imageFailed;
  const caption = shortenCoverTitle(item.title, item.description, 34);

  return (
    <button
      type="button"
      onClick={() => {
        tg?.HapticFeedback.impactOccurred('light');
        onSelect?.(item);
      }}
      className={`${thumbSize} text-left`}
      aria-label={item.title}
    >
      {showPhoto ? (
        <CachedListingImage
          src={imageSrc!}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          fadeIn={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ListingAutoCover
          listingId={item.id}
          title={item.title}
          description={item.description}
          category={item.category}
          subcategory={item.subcategory}
          size="sm"
          showTitle={false}
          className="!pb-9"
        />
      )}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[2] px-1.5 pb-1.5 pt-7 ${
          showPhoto
            ? 'bg-gradient-to-t from-black/80 via-black/45 to-transparent'
            : 'bg-gradient-to-t from-black/55 via-black/25 to-transparent'
        }`}
      >
        <p className="line-clamp-2 text-[9px] font-medium leading-[1.15] text-white sm:text-[10px]">
          {caption}
        </p>
      </div>
    </button>
  );
}

export function SimilarListingsStrip({
  listings,
  isLight,
  onSelect,
  onSeeMore,
  tg,
  maxVisible = 12,
}: SimilarListingsStripProps) {
  const { t } = useLanguage();
  const visible = listings.slice(0, maxVisible);
  const showSeeMore = listings.length > 0;

  if (visible.length === 0) return null;

  const thumbSize =
    'relative h-[7.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-md sm:h-[8.25rem] sm:w-[6rem]';

  return (
    <section className="w-full min-w-0 px-4 pb-2 pt-4 max-lg:px-4 lg:px-2 lg:pb-4 lg:pt-5">
      <h2
        className={`mb-2.5 text-sm font-semibold tracking-tight sm:text-[15px] ${
          isLight ? 'text-gray-900' : 'text-white'
        }`}
      >
        {t('listing.similarListings')}
      </h2>
      <div
        className="scrollbar-hide flex gap-2.5 overflow-x-auto pb-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {visible.map((item) => (
          <SimilarThumb
            key={item.id}
            item={item}
            onSelect={onSelect}
            tg={tg}
            thumbSize={thumbSize}
          />
        ))}

        {showSeeMore && (
          <button
            type="button"
            onClick={() => {
              tg?.HapticFeedback.impactOccurred('light');
              onSeeMore();
            }}
            className={`${thumbSize} flex flex-col items-center justify-center border text-center ${
              isLight
                ? 'border-gray-300 bg-white text-gray-800'
                : 'border-white/30 bg-transparent text-white'
            }`}
          >
            <span className="px-1 text-[9px] font-bold uppercase leading-tight tracking-wide sm:text-[10px]">
              {t('listing.seeMoreSimilar')}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
