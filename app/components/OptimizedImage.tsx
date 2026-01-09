'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { ImageIcon } from 'lucide-react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  fallback?: React.ReactNode;
}

/**
 * Оптимізований компонент зображення з fallback на звичайний img
 * Використовує Next.js Image з fallback для Telegram WebApp сумісності
 */
export function OptimizedImage({
  src,
  alt,
  className = '',
  fill = true,
  sizes = '(max-width: 768px) 50vw, 33vw',
  priority = false,
  onLoad,
  onError,
  fallback,
}: OptimizedImageProps) {
  const [useNextImage, setUseNextImage] = useState(true);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Перевіряємо, чи підтримується Next.js Image (може не працювати в Telegram WebApp)
  useEffect(() => {
    // Спробуємо використати Next.js Image, але маємо fallback
    if (typeof window !== 'undefined') {
      const isTelegramWebApp = window.Telegram?.WebApp;
      // В Telegram WebApp можуть бути проблеми з Next.js Image, тому маємо fallback
      if (isTelegramWebApp) {
        // Можна спробувати використати, але маємо fallback
      }
    }
  }, []);

  const handleError = () => {
    setImageError(true);
    setUseNextImage(false);
    onError?.();
  };

  const handleLoad = () => {
    onLoad?.();
  };

  // Якщо помилка або вирішили не використовувати Next.js Image
  if (!useNextImage || imageError) {
    return (
      <>
        {fallback || (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <ImageIcon size={48} className="text-gray-400" />
          </div>
        )}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={className}
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
        />
      </>
    );
  }

  // Використовуємо Next.js Image з обробкою помилок
  // Для Telegram WebApp використовуємо fallback на звичайний img
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    // В Telegram WebApp можуть бути проблеми з Next.js Image
    // Використовуємо звичайний img для сумісності
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        sizes={sizes}
      />
    );
  }

  // Для звичайних браузерів використовуємо Next.js Image
  try {
    return (
      <Image
        src={src}
        alt={alt}
        fill={fill}
        className={className}
        sizes={sizes}
        priority={priority}
        onLoad={handleLoad}
        onError={handleError}
        quality={85}
        style={{ objectFit: 'cover' }}
      />
    );
  } catch (error) {
    // Fallback на звичайний img при помилці
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        sizes={sizes}
      />
    );
  }
}
