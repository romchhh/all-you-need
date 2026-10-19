'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { buildListingImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { ListingAutoCover } from '@/components/listing/ListingAutoCover';
import { useTheme } from '@/contexts/ThemeContext';

interface ImageGalleryProps {
  images: string[];
  title: string;
  description?: string | null;
  listingId?: string | number;
  category?: string | null;
  subcategory?: string | null;
  onImageClick?: (index: number) => void;
}

export const ImageGallery = ({
  images,
  title,
  description,
  listingId = 0,
  category,
  subcategory,
  onImageClick,
}: ImageGalleryProps) => {
  const { isLight } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIndexes, setFailedIndexes] = useState<Set<number>>(new Set());

  const slideBgClass = isLight ? 'bg-white' : 'bg-black';

  const imageUrls = useMemo(() => {
    return images.map((imagePath) => buildListingImageUrl(imagePath));
  }, [images]);

  useEffect(() => {
    setActiveIndex(0);
    setFailedIndexes(new Set());
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  }, [JSON.stringify(images)]);

  const onScroll = () => {
    if (!containerRef.current) return;
    const scrollLeft = containerRef.current.scrollLeft;
    const width = containerRef.current.clientWidth;
    setActiveIndex(Math.round(scrollLeft / width));
  };

  const goToImage = (index: number) => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    containerRef.current.scrollTo({
      left: width * index,
      behavior: 'smooth',
    });
  };

  if (!images.length) {
    return (
      <div className="relative aspect-[3/4] w-full max-h-[min(72svh,560px)] overflow-hidden sm:aspect-[4/5]">
        <ListingAutoCover
          listingId={listingId}
          title={title}
          description={description}
          category={category}
          subcategory={subcategory}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${slideBgClass}`}>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className={`flex h-full w-full snap-x snap-mandatory scroll-smooth overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${slideBgClass}`}
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {imageUrls.map((src, index) => {
          const showCover = !src || failedIndexes.has(index);
          return (
            <div
              key={`${images[index]}-${index}`}
              className={`relative flex h-full w-full shrink-0 snap-start items-center justify-center ${slideBgClass}`}
              style={{ minWidth: '100%' }}
              onClick={() => onImageClick?.(index)}
            >
              {showCover ? (
                <ListingAutoCover
                  listingId={listingId}
                  title={title}
                  description={description}
                  category={category}
                  subcategory={subcategory}
                  size="lg"
                />
              ) : (
                <CachedListingImage
                  src={src}
                  alt={`${title} ${index + 1}`}
                  className="block h-auto max-h-full w-full max-w-full select-none object-contain"
                  draggable={false}
                  priority={index === 0}
                  fadeIn={false}
                  onError={() => {
                    setFailedIndexes((prev) => {
                      const next = new Set(prev);
                      next.add(index);
                      return next;
                    });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToImage(i);
              }}
              className="h-2 cursor-pointer rounded-full transition-all"
              style={{
                width: i === activeIndex ? 20 : 8,
                background: i === activeIndex ? '#3F5331' : 'rgba(63,83,49,.5)',
              }}
              aria-label={`Перейти до фото ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
