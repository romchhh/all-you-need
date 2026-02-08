import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  const [imageError, setImageError] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  
  // Оновлюємо індекс при зміні initialIndex
  useEffect(() => {
    if (isOpen && initialIndex !== undefined) {
      setCurrentIndex(initialIndex);
      setImageError(false);
    }
  }, [isOpen, initialIndex]);

  // Скидаємо помилку при зміні зображення
  useEffect(() => {
    setImageError(false);
  }, [imageList[currentIndex]]);

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
    const absX = Math.abs(diffX);
    
    // Запобігаємо pull-to-close та згортанню додатку для будь-якого руху на фото
    // Якщо це горизонтальний свайп (горизонтальний рух значно більший за вертикальний)
    // або вертикальний рух - запобігаємо дефолтній поведінці
    if ((absX > diffY * 2 && absX > 10) || diffY > 5) {
      e.preventDefault();
      e.stopPropagation();
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

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ 
        touchAction: 'none', 
        padding: '0', 
        width: '100vw', 
        maxWidth: '100vw',
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        background: '#000000'
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-white z-[100000] shrink-0 flex-shrink-0"
        style={{ minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px' }}
      >
        <X size={24} style={{ flexShrink: 0 }} />
      </button>
      
      {imageList.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-white z-[100000] shrink-0 flex-shrink-0"
            style={{ minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px' }}
          >
            <ChevronLeft size={24} style={{ flexShrink: 0 }} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#1C1C1C] border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-white z-[100000] shrink-0 flex-shrink-0"
            style={{ minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px' }}
          >
            <ChevronRight size={24} style={{ flexShrink: 0 }} />
          </button>
        </>
      )}
      
      <div 
        className="w-full flex items-center justify-center"
        style={{ width: '100vw', maxWidth: '100vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {imageError ? (
          <div className="text-white/70 text-center px-4">Зображення не завантажилось</div>
        ) : (
          <img 
            src={imageList[currentIndex]} 
            alt={`${alt} - фото ${currentIndex + 1}`}
            className="transition-opacity duration-300"
            style={{ 
              width: '100%', 
              maxWidth: '100%', 
              height: 'auto',
              maxHeight: '90vh',
              objectFit: 'contain',
              display: 'block'
            }}
            onClick={(e) => e.stopPropagation()}
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </div>
  );

  // Рендеримо через portal безпосередньо в body для гарантованого відображення над всіма елементами
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

