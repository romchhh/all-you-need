'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';

interface ImageViewModalProps {
  isOpen: boolean;
  images?: string[];
  imageUrl?: string;
  initialIndex?: number;
  alt: string;
  onClose: () => void;
}

export const ImageViewModal = ({ isOpen, images, imageUrl, initialIndex = 0, alt, onClose }: ImageViewModalProps) => {
  const { isLight } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageError, setImageError] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const imageList = images || (imageUrl ? [imageUrl] : []);

  useEffect(() => {
    if (isOpen && initialIndex !== undefined) {
      setCurrentIndex(initialIndex);
      setImageError(false);
    }
  }, [isOpen, initialIndex]);

  useEffect(() => {
    setImageError(false);
  }, [imageList[currentIndex]]);

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

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
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

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || imageList.length === 0) return null;

  const topInset = 'calc(1rem + env(safe-area-inset-top, 0px))';
  const roundBtn = isLight
    ? 'bg-white border border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50'
    : 'bg-[#1C1C1C] border border-white/20 backdrop-blur-sm text-white hover:bg-white/10';

  const modalContent = (
    <div
      className={`fixed inset-0 flex flex-col ${isLight ? 'bg-zinc-100' : ''}`}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        touchAction: 'none',
        padding: 0,
        width: '100vw',
        maxWidth: '100vw',
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isLight ? '#f4f4f5' : '#000000',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className={`absolute right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors z-[100000] shrink-0 flex-shrink-0 ${roundBtn}`}
        style={{
          minWidth: '40px',
          minHeight: '40px',
          maxWidth: '40px',
          maxHeight: '40px',
          top: topInset,
        }}
      >
        <X size={24} style={{ flexShrink: 0 }} />
      </button>

      {imageList.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-colors z-[100000] shrink-0 flex-shrink-0 ${roundBtn}`}
            style={{ minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px' }}
          >
            <ChevronLeft size={24} style={{ flexShrink: 0 }} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className={`absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-colors z-[100000] shrink-0 flex-shrink-0 ${roundBtn}`}
            style={{ minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px' }}
          >
            <ChevronRight size={24} style={{ flexShrink: 0 }} />
          </button>
        </>
      )}

      <div
        className="flex flex-1 w-full min-h-0 items-center justify-center px-2 pb-[env(safe-area-inset-bottom,0px)]"
        style={{ width: '100vw', maxWidth: '100vw', paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {imageError ? (
          <div className={`text-center px-4 ${isLight ? 'text-gray-600' : 'text-white/70'}`}>Зображення не завантажилось</div>
        ) : (
          <img
            src={imageList[currentIndex]}
            alt={`${alt} - фото ${currentIndex + 1}`}
            className="transition-opacity duration-300"
            style={{
              width: '100%',
              maxWidth: '100%',
              height: 'auto',
              maxHeight: 'min(90vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 5.5rem))',
              objectFit: 'contain',
              display: 'block',
            }}
            onClick={(e) => e.stopPropagation()}
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </div>
  );

  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
