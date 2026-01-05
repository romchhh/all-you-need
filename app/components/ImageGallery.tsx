import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

interface ImageGalleryProps {
  images: string[];
  title: string;
}

export const ImageGallery = ({ images, title }: ImageGalleryProps) => {
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
  const minSwipeDistance = 30;
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    setIsSwiping(true);
    setSwipeOffset(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchEndX.current = e.targetTouches[0].clientX;
    // Інвертуємо diff, щоб фото рухалося в правильному напрямку
    // Коли свайпаємо вліво (touchEndX < touchStartX), фото має рухатися вліво (негативний offset)
    // Коли свайпаємо вправо (touchEndX > touchStartX), фото має рухатися вправо (позитивний offset)
    const diff = touchEndX.current - touchStartX.current;
    // Обмежуємо зміщення для плавності
    setSwipeOffset(Math.max(-100, Math.min(100, diff)));
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) {
      setIsSwiping(false);
      setSwipeOffset(0);
      return;
    }
    
    // Інвертуємо distance для правильної логіки
    // Коли свайпаємо вліво (touchEndX < touchStartX), distance буде негативним, і ми хочемо nextImage
    // Коли свайпаємо вправо (touchEndX > touchStartX), distance буде позитивним, і ми хочемо prevImage
    const distance = touchEndX.current - touchStartX.current;
    const isLeftSwipe = distance < -minSwipeDistance; // Свайп вліво = наступне фото
    const isRightSwipe = distance > minSwipeDistance; // Свайп вправо = попереднє фото

    setIsSwiping(false);
    setSwipeOffset(0);

    if (isLeftSwipe) {
      nextImage(); // Свайп вліво = наступне фото
    } else if (isRightSwipe) {
      prevImage(); // Свайп вправо = попереднє фото
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
      style={{ 
        touchAction: 'pan-y pinch-zoom',
        position: 'relative',
        width: '100%',
        maxWidth: '100%'
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
          className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(${swipeOffset}px)`,
          }}
        >
          <img 
            src={imageUrls[currentIndex]}
            alt={`${title} - фото ${currentIndex + 1}`}
            className={`w-full h-full object-contain transition-all duration-500 ease-in-out ${
              imageLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
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

          {/* Кнопки навігації */}
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 z-20"
            aria-label="Попереднє фото"
            style={{ 
              position: 'absolute',
              left: '1rem',
              right: 'auto',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20
            }}
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 z-20"
            aria-label="Наступне фото"
            style={{ 
              position: 'absolute',
              right: '1rem',
              left: 'auto',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20
            }}
          >
            <ChevronRight size={20} className="text-gray-700" />
          </button>

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
