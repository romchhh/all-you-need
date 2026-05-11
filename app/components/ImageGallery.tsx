import { Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { buildListingImageUrl } from '@/utils/listingImageUrl';

interface ImageGalleryProps {
  images: string[];
  title: string;
  onImageClick?: (index: number) => void;
}

export const ImageGallery = ({ images, title, onImageClick }: ImageGalleryProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Мемоізуємо URL зображень, щоб уникнути зайвих запитів
  const imageUrls = useMemo(() => {
    return images.map((imagePath) => buildListingImageUrl(imagePath));
  }, [images]);

  // Скидаємо activeIndex до 0 при зміні images (новий товар)
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
    const placeholderHeight = typeof window !== 'undefined' && window.innerWidth < 768 ? '300px' : '400px';
    return (
      <div className="flex items-center justify-center rounded-2xl bg-black/50" style={{ height: placeholderHeight, width: '100%' }}>
        <div className="text-center">
          <ImageIcon size={window.innerWidth < 768 ? 48 : 64} className="mx-auto mb-2 text-white/40" />
          <p className="text-sm text-white/70">Немає фото</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Scroll container */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth rounded-2xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full h-full"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {imageUrls.map((src, index) => (
          <div
            key={`${images[index]}-${index}`}
            className="snap-start shrink-0 w-full h-full relative"
            style={{ minWidth: '100%' }}
            onClick={() => onImageClick?.(index)}
          >
            {src ? (
              <img
                src={src}
                alt={`${title} ${index + 1}`}
                className="w-full h-full object-cover select-none"
                draggable={false}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
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
            {/* Placeholder для помилки завантаження */}
            <div
              className="error-placeholder absolute inset-0 flex items-center justify-center bg-black/50"
              style={{ display: src ? 'none' : 'flex' }}
            >
              <div className="text-center">
                <ImageIcon size={64} className="mx-auto mb-2 text-white/40" />
                <p className="text-sm text-white/70">Помилка завантаження</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 z-20">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                goToImage(i);
              }}
              className="h-2 rounded-full transition-all cursor-pointer"
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
