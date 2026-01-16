import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

interface ImageViewModalProps {
  isOpen: boolean;
  images?: string[];
  imageUrl?: string;
  initialIndex?: number;
  alt: string;
  onClose: () => void;
}

export const ImageViewModal = ({ isOpen, images, imageUrl, initialIndex = 0, alt, onClose }: ImageViewModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  
  // Оновлюємо індекс при зміні initialIndex
  useEffect(() => {
    if (isOpen && initialIndex !== undefined) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  const imageList = images || (imageUrl ? [imageUrl] : []);
  
  const nextImage = () => {
    if (imageList.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % imageList.length);
    }
  };

  const prevImage = () => {
    if (imageList.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    touchEndX.current = currentX;
    const diffX = currentX - touchStartX.current;
    const diffY = Math.abs(currentY - touchStartY.current);
    
    // Якщо це горизонтальний свайп, запобігаємо свайпу назад
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      e.preventDefault();
    }
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }
    const distance = touchEndX.current - touchStartX.current;
    const minSwipeDistance = 50;
    
    if (distance < -minSwipeDistance) {
      nextImage();
    } else if (distance > minSwipeDistance) {
      prevImage();
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
    touchStartY.current = null;
  };
  // Блокуємо скрол body та html при відкритому модальному вікні
  useEffect(() => {
    if (isOpen) {
      // Зберігаємо поточну позицію скролу
      const scrollY = window.scrollY;
      // Блокуємо скрол на body та html
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Розблоковуємо скрол
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    
    // Cleanup при розмонтуванні
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || imageList.length === 0) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: 'pan-x' }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-white z-20"
      >
        <X size={24} />
      </button>
      
      {imageList.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-white z-20"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-white z-20"
          >
            <ChevronRight size={24} />
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm text-white text-sm font-medium px-3 py-1.5 rounded-full z-20">
            {currentIndex + 1} / {imageList.length}
          </div>
        </>
      )}
      
      <img 
        src={imageList[currentIndex]} 
        alt={`${alt} - фото ${currentIndex + 1}`}
        className="max-w-full max-h-[90vh] object-contain transition-opacity duration-300"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

