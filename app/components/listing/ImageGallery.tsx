'use client';

import { Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { buildListingImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { useTheme } from '@/contexts/ThemeContext';

interface ImageGalleryProps {
  images: string[];
  title: string;
  onImageClick?: (index: number) => void;
}

export const ImageGallery = ({ images, title, onImageClick }: ImageGalleryProps) => {
  const { isLight } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slideBgClass = isLight ? 'bg-white' : 'bg-black';

  const imageUrls = useMemo(() => {
    return images.map((imagePath) => buildListingImageUrl(imagePath));
  }, [images]);

  useEffect(() => {
    setActiveIndex(0);
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
    const placeholderHeight = typeof window !== 'undefined' && window.innerWidth < 768 ? '280px' : '360px';
    return (
      <div
        className={`flex items-center justify-center ${slideBgClass}`}
        style={{ height: placeholderHeight, width: '100%' }}
      >
        <div className="text-center">
          <ImageIcon
            size={window.innerWidth < 768 ? 48 : 64}
            className={`mx-auto mb-2 ${isLight ? 'text-gray-300' : 'text-white/40'}`}
          />
          <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-white/70'}`}>Немає фото</p>
        </div>
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
        {imageUrls.map((src, index) => (
          <div
            key={`${images[index]}-${index}`}
            className={`relative flex h-full w-full shrink-0 snap-start items-center justify-center ${slideBgClass}`}
            style={{ minWidth: '100%' }}
            onClick={() => onImageClick?.(index)}
          >
            {src ? (
              <CachedListingImage
                src={src}
                alt={`${title} ${index + 1}`}
                className="block h-auto max-h-full w-full max-w-full select-none object-contain"
                draggable={false}
                priority={index === 0}
                fadeIn={false}
                onError={(e) => {
                  console.error('Error loading image:', images[index], src);
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const placeholder = target.parentElement?.querySelector('.error-placeholder');
                  if (placeholder) {
                    (placeholder as HTMLElement).style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div
              className={`error-placeholder absolute inset-0 flex items-center justify-center ${slideBgClass}`}
              style={{ display: src ? 'none' : 'flex' }}
            >
              <div className="text-center">
                <ImageIcon size={64} className={`mx-auto mb-2 ${isLight ? 'text-gray-300' : 'text-white/40'}`} />
                <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-white/70'}`}>Помилка завантаження</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-2">
          {images.map((_, i) => (
            <button
              key={i}
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
