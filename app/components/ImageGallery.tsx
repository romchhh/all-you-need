import { Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

interface ImageGalleryProps {
  images: string[];
  title: string;
  onImageClick?: (index: number) => void;
}

export const ImageGallery = ({ images, title, onImageClick }: ImageGalleryProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    setImageLoading(true);
    setImageError(false);
  }, [currentIndex]);

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  // Swipe жести з плавністю
  const minSwipeDistance = 50;
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchEndY.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
    setIsSwiping(false); // Спочатку вважаємо, що це не свайп
    setSwipeOffset(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;
    touchEndX.current = currentX;
    touchEndY.current = currentY;
    const diffX = touchEndX.current - touchStartX.current;
    const diffY = Math.abs(currentY - touchStartY.current);
    
    // Перевіряємо, чи це горизонтальний рух (переважно горизонтальний)
    const isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
    
    // Запобігаємо дефолтній поведінці ТІЛЬКИ якщо це явно горизонтальний рух
    // і він достатньо великий, щоб не заважати вертикальному скролу
    if (isHorizontalSwipe && Math.abs(diffX) > 15 && Math.abs(diffX) > diffY * 2) {
      e.preventDefault();
      setIsSwiping(true);
      // Обмежуємо зміщення для плавності
      setSwipeOffset(Math.max(-200, Math.min(200, diffX)));
    } else {
      // Якщо це вертикальний рух або змішаний, скидаємо offset і не запобігаємо скролу
      setIsSwiping(false);
      setSwipeOffset(0);
    }
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || touchEndX.current === null || touchStartY.current === null || touchEndY.current === null) {
      setIsSwiping(false);
      setSwipeOffset(0);
      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      touchEndY.current = null;
      return;
    }
    
    const distanceX = touchEndX.current - touchStartX.current;
    const distanceY = touchEndY.current - touchStartY.current;
    const absX = Math.abs(distanceX);
    const absY = Math.abs(distanceY);
    
    // Перевіряємо, чи це дійсно горизонтальний свайп (більш горизонтальний, ніж вертикальний)
    const isHorizontalSwipe = absX > absY * 1.5; // Горизонтальний рух має бути в 1.5 рази більшим за вертикальний
    
    setIsSwiping(false);
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;

    // Обробляємо тільки якщо це явно горизонтальний свайп
    if (isHorizontalSwipe && absX > minSwipeDistance) {
      const isLeftSwipe = distanceX < 0; // Свайп вліво = наступне фото
      const isRightSwipe = distanceX > 0; // Свайп вправо = попереднє фото

      if (isLeftSwipe) {
        nextImage(); // Свайп вліво = наступне фото
      } else if (isRightSwipe) {
        prevImage(); // Свайп вправо = попереднє фото
      }
    }
  };

  // Мемоізуємо URL зображень, щоб уникнути зайвих запитів
  const imageUrls = useMemo(() => {
    return images.map((imagePath) => {
      if (imagePath?.startsWith('http')) {
        return imagePath;
      }
      // Видаляємо query параметри якщо є
      const cleanPath = imagePath?.split('?')[0] || imagePath;
      // Видаляємо початковий слеш якщо є
      const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
      // Використовуємо API route для обслуговування зображень без timestamp
      return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
    });
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="relative aspect-square bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <ImageIcon size={64} className="text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Немає фото</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full aspect-square bg-gray-100 overflow-hidden ImageGallery"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => onImageClick?.(currentIndex)}
      style={{ 
        touchAction: 'pan-y',
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        cursor: onImageClick ? 'pointer' : 'default'
      }}
    >
      {/* Skeleton loader */}
      {imageLoading && !imageError && (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}
      
      {/* Placeholder або зображення */}
      {imageError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <ImageIcon size={64} className="text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Помилка завантаження</p>
          </div>
        </div>
      ) : (
        <div 
          className="absolute inset-0 flex items-center justify-center transition-transform duration-200 ease-out"
          style={{
            transform: `translateX(${swipeOffset}px)`,
          }}
        >
          <img 
            src={imageUrls[currentIndex]}
            alt={`${title} - фото ${currentIndex + 1}`}
            className={`w-full h-full object-cover transition-opacity duration-300 ease-in-out ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            }`}
            loading={currentIndex === 0 ? 'eager' : 'lazy'}
            decoding="async"
            sizes="100vw"
            key={`${images[currentIndex]}-${currentIndex}`}
            onLoad={() => setImageLoading(false)}
            onError={(e) => {
              setImageLoading(false);
              setImageError(true);
              console.error('Error loading image:', images[currentIndex]);
            }}
          />
        </div>
      )}
      
      {images.length > 1 && (
        <>
          {/* Індикатор фото - зверху справа */}
          <div 
            className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full z-20"
            style={{ 
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              left: 'auto',
              zIndex: 20,
              pointerEvents: 'none'
            }}
          >
            {currentIndex + 1} / {images.length}
          </div>


          {/* Точки індикації - знизу по центру */}
          <div 
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20"
            style={{ 
              position: 'absolute',
              bottom: '1rem',
              left: '50%',
              right: 'auto',
              top: 'auto',
              transform: 'translateX(-50%)',
              zIndex: 20
            }}
          >
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex 
                    ? 'bg-white w-6' 
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Перейти до фото ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
