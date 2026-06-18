'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImageOnClient } from '@/utils/imageUtils';
import { LISTING_MAX_PHOTOS } from '@/features/listing-form/lib/constants';

export type ListingImageItem = {
  id: string;
  preview: string;
  file?: File;
  /** Stored path/URL for photos already on the server */
  existingUrl?: string;
};

type UseListingImageUploadOptions = {
  isOpen: boolean;
  maxPhotos?: number;
  onMaxPhotos?: () => void;
  initialPreviews?: string[];
  initialFiles?: File[];
};

let nextItemId = 0;

function createItemId(prefix: string) {
  nextItemId += 1;
  return `${prefix}-${nextItemId}`;
}

function buildItemsFromInitial(
  initialPreviews: string[],
  initialFiles: File[]
): ListingImageItem[] {
  let fileIdx = 0;
  return initialPreviews.map((preview, index) => {
    const isNewUpload = preview.startsWith('data:');
    const file = isNewUpload ? initialFiles[fileIdx++] : undefined;
    return {
      id: createItemId(`init-${index}`),
      preview,
      file,
      existingUrl: isNewUpload ? undefined : preview,
    };
  });
}

export function useListingImageUpload({
  isOpen,
  maxPhotos = LISTING_MAX_PHOTOS,
  onMaxPhotos,
  initialPreviews = [],
  initialFiles = [],
}: UseListingImageUploadOptions) {
  const [items, setItems] = useState<ListingImageItem[]>(() =>
    buildItemsFromInitial(initialPreviews, initialFiles)
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
  const [touchElementRect, setTouchElementRect] = useState<DOMRect | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const isDraggingRef = useRef(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      nextItemId = 0;
      setItems(buildItemsFromInitial(initialPreviews, initialFiles));
      setDraggedIndex(null);
      setTouchStartIndex(null);
      setTouchStartY(null);
      setTouchPosition(null);
      setTouchElementRect(null);
      setHoveredIndex(null);
      setIsLocked(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialPreviews, initialFiles]);

  const imagePreviews = items.map((item) => item.preview);
  const images = items.filter((item) => item.file).map((item) => item.file!);

  const setImagePreviews = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    setItems((prev) => {
      const nextPreviews = typeof value === 'function' ? value(prev.map((i) => i.preview)) : value;
      return nextPreviews.map((preview, index) => {
        const prevItem = prev[index];
        if (prevItem && prevItem.preview === preview) return prevItem;
        return {
          id: createItemId('set'),
          preview,
          existingUrl: preview.startsWith('data:') ? undefined : preview,
        };
      });
    });
  }, []);

  const setImages = useCallback((value: File[] | ((prev: File[]) => File[])) => {
    setItems((prev) => {
      const prevFiles = prev.filter((i) => i.file).map((i) => i.file!);
      const nextFiles = typeof value === 'function' ? value(prevFiles) : value;
      let fileIdx = 0;
      return prev.map((item) => {
        if (item.file) {
          const nextFile = nextFiles[fileIdx++];
          return nextFile ? { ...item, file: nextFile } : item;
        }
        return item;
      });
    });
  }, []);

  const moveImage = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  }, []);

  const removeImage = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (items.length >= maxPhotos) {
        onMaxPhotos?.();
        e.target.value = '';
        return;
      }

      const availableSlots = maxPhotos - items.length;
      const filesToAdd = files.slice(0, availableSlots);
      if (files.length > filesToAdd.length) {
        onMaxPhotos?.();
      }
      if (filesToAdd.length === 0) {
        e.target.value = '';
        return;
      }

      const compressedFiles: File[] = [];
      for (const file of filesToAdd) {
        try {
          if (file.size > 2 * 1024 * 1024) {
            compressedFiles.push(await compressImageOnClient(file, 2));
          } else {
            compressedFiles.push(file);
          }
        } catch {
          compressedFiles.push(file);
        }
      }

      const previews = await Promise.all(
        compressedFiles.map(
          (file) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            })
        )
      );

      setItems((prev) => [
        ...prev,
        ...compressedFiles.map((file, index) => ({
          id: createItemId('new'),
          preview: previews[index],
          file,
        })),
      ]);
      e.target.value = '';
    },
    [items.length, maxPhotos, onMaxPhotos]
  );

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
      moveImage(draggedIndex, index);
      setDraggedIndex(index);
    },
    [draggedIndex, moveImage]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    const element = e.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    setTouchElementRect(rect);

    const preventSelection = (ev: Event) => ev.preventDefault();
    document.addEventListener('selectstart', preventSelection);

    const preventPullToClose = (ev: TouchEvent) => {
      if (isDraggingRef.current) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    document.addEventListener('touchmove', preventPullToClose, { passive: false });

    const cleanup = () => {
      isDraggingRef.current = false;
      document.removeEventListener('selectstart', preventSelection);
      document.removeEventListener('touchmove', preventPullToClose);
      document.removeEventListener('touchend', cleanup);
      document.removeEventListener('touchcancel', cleanup);
    };
    document.addEventListener('touchend', cleanup, { once: true });
    document.addEventListener('touchcancel', cleanup, { once: true });

    const touch = e.touches[0];
    setTouchStartIndex(index);
    setTouchStartY(touch.clientY);
    setTouchPosition({ x: touch.clientX, y: touch.clientY });
    setDraggedIndex(index);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartIndex === null || touchStartY === null || touchElementRect === null) return;
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      setTouchPosition({ x: touch.clientX, y: touch.clientY });

      const allPhotoElements = document.querySelectorAll('[data-photo-index]');
      let targetIndex: number | null = null;
      for (const photoElement of allPhotoElements) {
        const indexAttr = photoElement.getAttribute('data-photo-index');
        if (!indexAttr) continue;
        const elementIndex = parseInt(indexAttr, 10);
        if (elementIndex === touchStartIndex) continue;
        const rect = photoElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        if (
          Math.abs(touch.clientX - centerX) <= rect.width * 0.5 &&
          Math.abs(touch.clientY - centerY) <= rect.height * 0.5
        ) {
          targetIndex = elementIndex;
          break;
        }
      }

      setHoveredIndex(targetIndex);

      if (targetIndex !== null && touchStartIndex !== targetIndex && !isLocked) {
        setIsLocked(true);
        moveImage(touchStartIndex, targetIndex);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newPhotoElement = document.querySelector(
              `[data-photo-index="${targetIndex}"]`
            ) as HTMLElement | null;
            if (newPhotoElement) {
              const newRect = newPhotoElement.getBoundingClientRect();
              setTouchElementRect(newRect);
              setTouchPosition({
                x: newRect.left + newRect.width / 2,
                y: newRect.top + newRect.height / 2,
              });
            }
            setTouchStartIndex(targetIndex);
            setDraggedIndex(targetIndex);
            setTimeout(() => setIsLocked(false), 200);
          });
        });
      }
    },
    [touchStartIndex, touchStartY, touchElementRect, isLocked, moveImage]
  );

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
    setTouchStartIndex(null);
    setTouchStartY(null);
    setDraggedIndex(null);
    setTouchPosition(null);
    setTouchElementRect(null);
    setHoveredIndex(null);
    setIsLocked(false);
  }, []);

  return {
    items,
    images,
    setImages,
    imagePreviews,
    setImagePreviews,
    draggedIndex,
    touchPosition,
    touchElementRect,
    hoveredIndex,
    isLocked,
    handleImageChange,
    removeImage,
    moveImage,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
