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
    if (!isOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isOpen]);

  if (!isOpen || imageList.length === 0) return null;

  const roundBtn = isLight
    ? 'bg-white border border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50'
    : 'bg-[#1C1C1C] border border-white/20 backdrop-blur-sm text-white hover:bg-white/10';
  const closeBtnSurface = isLight
    ? 'border border-gray-300 bg-white/95 text-gray-900 shadow-sm hover:bg-gray-100'
    : 'border border-white bg-black/40 text-white backdrop-blur-sm hover:bg-white/10';

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        touchAction: 'none',
        width: '100vw',
        height: '100dvh',
        maxWidth: '100vw',
        maxHeight: '100dvh',
        backgroundColor: isLight ? '#f4f4f5' : '#000000',
        paddingTop: 'max(env(safe-area-inset-top,0px),8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom,0px),8px)',
        paddingLeft: 'max(env(safe-area-inset-left,0px),8px)',
        paddingRight: 'max(env(safe-area-inset-right,0px),8px)',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className={`absolute right-4 top-[max(env(safe-area-inset-top,0px),12px)] z-[100000] flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${closeBtnSurface}`}
        aria-label="Закрити"
      >
        <X size={20} strokeWidth={2.25} className="shrink-0" />
      </button>

      {imageList.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className={`absolute left-3 top-1/2 z-[100000] flex h-10 w-10 -translate-y-1/2 shrink-0 items-center justify-center rounded-full transition-colors ${roundBtn}`}
            aria-label="Попереднє фото"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className={`absolute right-3 top-1/2 z-[100000] flex h-10 w-10 -translate-y-1/2 shrink-0 items-center justify-center rounded-full transition-colors ${roundBtn}`}
            aria-label="Наступне фото"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <div
        className="flex h-full w-full max-h-full max-w-full items-center justify-center px-12"
        onClick={(e) => e.stopPropagation()}
      >
        {imageError ? (
          <div className={`px-4 text-center ${isLight ? 'text-gray-600' : 'text-white/70'}`}>
            Зображення не завантажилось
          </div>
        ) : (
          <img
            src={imageList[currentIndex]}
            alt={`${alt} - фото ${currentIndex + 1}`}
            className="max-h-full max-w-full object-contain"
            style={{
              width: 'auto',
              height: 'auto',
              maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)',
              maxWidth: '100%',
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
