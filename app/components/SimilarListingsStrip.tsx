'use client';

import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildListingImageUrl } from '@/utils/listingImageUrl';

interface SimilarListingsStripProps {
  listings: Listing[];
  isLight: boolean;
  onSelect?: (listing: Listing) => void;
  onSeeMore: () => void;
  tg?: TelegramWebApp | null;
  /** Скільки мініатюр показати перед карткою «ще». */
  maxVisible?: number;
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
    'relative h-[5.75rem] w-[5.75rem] shrink-0 overflow-hidden rounded-md sm:h-[6.25rem] sm:w-[6.25rem]';

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
        {visible.map((item) => {
          const imageSrc = buildListingImageUrl(item.image || item.images?.[0]);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                tg?.HapticFeedback.impactOccurred('light');
                onSelect?.(item);
              }}
              className={`${thumbSize} text-left`}
              aria-label={item.title}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <div
                  className={`absolute inset-0 ${
                    isLight ? 'bg-gray-200' : 'bg-[#2A2A2A]'
                  }`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/5" />
              <div className="absolute inset-x-0 bottom-0 px-1.5 pb-1.5 pt-6">
                <p className="line-clamp-2 text-[9px] font-medium leading-[1.15] text-white sm:text-[10px]">
                  {item.title}
                </p>
              </div>
            </button>
          );
        })}

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
