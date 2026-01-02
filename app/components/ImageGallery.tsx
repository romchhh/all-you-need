import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

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
    const diff = touchStartX.current - touchEndX.current;
    // Обмежуємо зміщення для плавності
    setSwipeOffset(Math.max(-100, Math.min(100, diff)));
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) {
      setIsSwiping(false);
      setSwipeOffset(0);
      return;
    }
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    setIsSwiping(false);
    setSwipeOffset(0);

    if (isLeftSwipe) {
      nextImage();
    } else if (isRightSwipe) {
      prevImage();
    }
  };

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

  // Функція для отримання URL зображення через API
  const getImageUrl = (imagePath: string) => {
    if (imagePath?.startsWith('http')) {
      return imagePath;
    }
    // Видаляємо query параметри якщо є
    const cleanPath = imagePath?.split('?')[0] || imagePath;
    // Видаляємо початковий слеш якщо є
    const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
    // Використовуємо API route для обслуговування зображень
    return `/api/images/${pathWithoutSlash}?t=${Date.now()}`;
  };

  return (
    <div 
      className="relative aspect-square bg-gray-100 overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: 'pan-y pinch-zoom' }}
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
            src={getImageUrl(images[currentIndex])}
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
          {/* Індикатор фото */}
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
            {currentIndex + 1} / {images.length}
          </div>

          {/* Кнопки навігації */}
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95"
          >
            <ChevronRight size={20} className="text-gray-700" />
          </button>

          {/* Точки індикації */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex 
                    ? 'bg-white w-6' 
                    : 'bg-white/50 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

