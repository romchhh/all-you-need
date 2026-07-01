'use client';

import { ImgHTMLAttributes, useEffect, useState } from 'react';
import {
  isListingImageLoaded,
  markListingImageLoaded,
} from '@/lib/media/listingMediaCache';

type CachedListingImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'loading' | 'fetchPriority'
> & {
  src: string;
  priority?: boolean;
  fadeIn?: boolean;
};

export function CachedListingImage({
  src,
  alt = '',
  priority = false,
  fadeIn = true,
  className = '',
  onLoad,
  onError,
  ...rest
}: CachedListingImageProps) {
  const alreadyLoaded = src ? isListingImageLoaded(src) : true;
  const [loaded, setLoaded] = useState(alreadyLoaded);
  const [errored, setErrored] = useState(!src);

  useEffect(() => {
    if (!src) {
      setLoaded(false);
      setErrored(true);
      return;
    }
    if (isListingImageLoaded(src)) {
      setLoaded(true);
      setErrored(false);
      return;
    }
    setLoaded(false);
    setErrored(false);
  }, [src]);

  if (!src || errored) {
    return null;
  }

  const opacityClass =
    fadeIn && !loaded ? 'opacity-0 transition-opacity duration-200' : 'opacity-100';

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={`${opacityClass} ${className}`.trim()}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onLoad={(e) => {
        markListingImageLoaded(src);
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setErrored(true);
        onError?.(e);
      }}
    />
  );
}
