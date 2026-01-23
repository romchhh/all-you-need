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

  // Скидаємо currentIndex до 0 при зміні images (новий товар)
  // Використовуємо JSON.stringify для надійного відстеження змін масиву
  useEffect(() => {
    setCurrentIndex(0);
    setImageLoading(true);
    setImageError(false);
  }, [JSON.stringify(images)]);

  useEffect(() => {
    setImageLoading(true);
    setImageError(false);
  }, [currentIndex]);

  const nextImage = () => {
    setCurrentIndex((prev) => {
      const next = (prev + 1) % images.length;
      return next;
    });
  };

  const prevImage = () => {
    setCurrentIndex((prev) => {
      const prevIndex = (prev - 1 + images.length) % images.length;
      return prevIndex;
    });
  };

  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  // Swipe жести з плавністю
  const minSwipeDistance = 50;
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const lastMoveTime = useRef<number>(0);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchEndY.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
    setIsSwiping(false);
    setSwipeOffset(0);
    lastMoveTime.current = Date.now();
    // Не блокуємо подію - дозволяємо передати на батьківський елемент для скролу сторінки
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const currentTime = Date.now();
    lastMoveTime.current = currentTime;
    
    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;
    touchEndX.current = currentX;
    touchEndY.current = currentY;
    const diffX = touchEndX.current - touchStartX.current;
    const diffY = currentY - touchStartY.current;
    const absDiffY = Math.abs(diffY);
    const absX = Math.abs(diffX);
    
    // Якщо рух ще невеликий - чекаємо більше руху для визначення напрямку
    if (absX < 10 && absDiffY < 10) {
      return; // Не визначено напрямок - чекаємо
    }
    
    // Якщо вертикальний рух значно більший за горизонтальний (в 2+ рази) - дозволяємо скрол сторінки
    if (absDiffY > absX * 2 && absDiffY > 15) {
      // Це вертикальний скрол - повністю ігноруємо та дозволяємо події пройти далі
      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      touchEndY.current = null;
      setIsSwiping(false);
      setSwipeOffset(0);
      // НЕ викликаємо preventDefault, щоб дозволити скрол сторінки
      return;
    }
    
    // Якщо горизонтальний рух більший за вертикальний або горизонтальний рух достатньо великий
    const isHorizontalSwipe = absX > absDiffY || (absX > 20 && absDiffY < absX * 0.7);
    
    if (isHorizontalSwipe) {
      e.preventDefault();
      e.stopPropagation();
      setIsSwiping(true);
      const maxOffset = 250;
      const smoothOffset = diffX * 0.8;
      setSwipeOffset(Math.max(-maxOffset, Math.min(maxOffset, smoothOffset)));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
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
    
    // Перевіряємо, чи це дійсно горизонтальний свайп
    // Горизонтальний рух має бути більшим за вертикальний або достатньо великим
    const isHorizontalSwipe = (absX > absY && absX > minSwipeDistance) || (absX > 30 && absY < absX * 0.7);

    setIsSwiping(false);
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;

    // Обробляємо тільки якщо це явно горизонтальний свайп
    if (isHorizontalSwipe) {
      const isLeftSwipe = distanceX < 0; // Свайп вліво = наступне фото
      const isRightSwipe = distanceX > 0; // Свайп вправо = попереднє фото

      if (isLeftSwipe) {
        nextImage(); // Свайп вліво = наступне фото
      } else if (isRightSwipe) {
        prevImage(); // Свайп вправо = попереднє фото
      }
    }
    // Для вертикальних свайпів не блокуємо подію - дозволяємо скрол сторінки
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
      <div className="relative aspect-square flex items-center justify-center rounded-2xl overflow-hidden" style={{ background: 'rgba(0, 0, 0, 0.5)', minHeight: '400px' }}>
        <div className="text-center">
          <ImageIcon size={64} className="mx-auto mb-2" style={{ color: 'rgba(211, 241, 167, 0.5)' }} />
          <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Немає фото</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full overflow-hidden ImageGallery rounded-2xl"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => onImageClick?.(currentIndex)}
      style={{ 
        touchAction: 'pan-x pan-y pinch-zoom', // Дозволяємо горизонтальні та вертикальні свайпи
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        minHeight: '400px',
        cursor: onImageClick ? 'pointer' : 'default',
        background: 'rgba(0, 0, 0, 0.5)',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'none', // Забороняємо власний скрол контейнера
        WebkitTapHighlightColor: 'transparent',
        pointerEvents: 'auto',
        overflow: 'hidden' // Забороняємо скрол всередині контейнера
      }}
    >
      {/* Skeleton loader */}
      {imageLoading && !imageError && (
        <div 
          className="absolute inset-0 animate-pulse" 
          style={{ 
            background: 'rgba(63, 83, 49, 0.5)',
            transition: 'opacity 0.3s ease-in-out'
          }} 
        />
      )}
      
      {/* Placeholder або зображення */}
      {imageError ? (
        <div 
          className="absolute inset-0 flex items-center justify-center" 
          style={{ 
            background: 'rgba(0, 0, 0, 0.5)',
            touchAction: 'none' // Блокуємо скрол в плейсхолдері
          }}
        >
          <div className="text-center">
            <ImageIcon size={64} className="mx-auto mb-2" style={{ color: 'rgba(211, 241, 167, 0.5)' }} />
            <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Помилка завантаження</p>
          </div>
        </div>
      ) : (
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwiping ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: isSwiping ? 'transform' : 'auto',
            touchAction: 'pan-y pinch-zoom', // Дозволяємо вертикальний скрол для передачі на батьківський елемент
            pointerEvents: 'auto'
          }}
        >
          {imageLoading && (
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{
                touchAction: 'none', // Блокуємо скрол в плейсхолдері завантаження
                zIndex: 1
              }}
            >
              <div className="text-center">
                <ImageIcon size={64} className="mx-auto mb-2" style={{ color: 'rgba(211, 241, 167, 0.5)' }} />
              </div>
            </div>
          )}
          <img 
            src={imageUrls[currentIndex]}
            alt={`${title} - фото ${currentIndex + 1}`}
            className={`w-full object-cover ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            }`}
            loading={currentIndex === 0 ? 'eager' : 'lazy'}
            decoding="async"
            sizes="100vw"
            key={`img-${currentIndex}-${images.length}-${images[currentIndex]}`}
            onLoad={() => {
              setImageLoading(false);
              setImageError(false);
            }}
            onError={(e) => {
              setImageLoading(false);
              setImageError(true);
              console.error('Error loading image:', images[currentIndex]);
            }}
            style={{
              display: 'block',
              visibility: 'visible',
              opacity: imageError ? 0 : 1,
              transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'pan-y pinch-zoom', // Дозволяємо вертикальний скрол для передачі на батьківський елемент
              pointerEvents: 'auto',
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </div>
      )}
      
      {images.length > 1 && (
        <>
          {/* Індикатор фото - зверху справа */}
          <div 
            className="absolute top-4 right-4 backdrop-blur-sm text-xs font-medium px-3 py-1.5 rounded-full z-20"
            style={{ 
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              left: 'auto',
              zIndex: 20,
              pointerEvents: 'none',
              background: 'rgba(211, 241, 167, 0.9)',
              color: '#000000'
            }}
          >
            {currentIndex + 1} / {images.length}
          </div>


          {/* Точки індикації - знизу по центру */}
          <div 
            className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-2 z-20"
          >
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-all`}
                style={{
                  background: index === currentIndex ? '#D3F1A7' : 'rgba(211, 241, 167, 0.5)',
                  width: index === currentIndex ? '24px' : '8px'
                }}
                aria-label={`Перейти до фото ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
