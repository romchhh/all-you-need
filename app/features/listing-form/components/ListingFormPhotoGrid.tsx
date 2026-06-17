'use client';

import { Upload, X } from 'lucide-react';

type ListingFormPhotoGridProps = {
  imagePreviews: string[];
  imagesCount: number;
  maxPhotos: number;
  isLight: boolean;
  photosLabel: string;
  addMoreLabel: string;
  activeRingClass: string;
  pageHeadingClass: string;
  draggedIndex: number | null;
  touchPosition: { x: number; y: number } | null;
  touchElementRect: DOMRect | null;
  hoveredIndex: number | null;
  isLocked: boolean;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onTouchStart: (e: React.TouchEvent, index: number) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
};

export function ListingFormPhotoGrid({
  imagePreviews,
  imagesCount,
  maxPhotos,
  isLight,
  photosLabel,
  addMoreLabel,
  activeRingClass,
  pageHeadingClass,
  draggedIndex,
  touchPosition,
  touchElementRect,
  hoveredIndex,
  isLocked,
  onImageChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: ListingFormPhotoGridProps) {
  return (
    <div>
      <label className={`block text-sm font-medium mb-2 ${pageHeadingClass}`}>{photosLabel}</label>
      {imagePreviews.length === 0 ? (
        <label
          className={`w-full px-4 py-8 bg-transparent rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
            isLight ? 'border-gray-300 hover:border-gray-400' : 'border-white hover:border-white/70'
          }`}
        >
          <Upload size={32} className={`mb-2 ${isLight ? 'text-gray-600' : 'text-white'}`} />
          <span className={`text-sm ${isLight ? 'text-gray-800' : 'text-white'}`}>
            {photosLabel.replace(' *', '')}
          </span>
          <input type="file" accept="image/*" multiple onChange={onImageChange} className="hidden" />
        </label>
      ) : (
        <div className="w-full px-4 py-3 bg-transparent rounded-xl">
          <div className="grid grid-cols-3 gap-2 mb-2 relative">
            {imagePreviews.map((preview, index) => {
              const isDragging =
                draggedIndex === index && touchPosition !== null && touchElementRect !== null && !isLocked;
              const isHovered = hoveredIndex === index && draggedIndex !== index;
              const isSnapping = isLocked && draggedIndex === index;
              let dragTransform = '';
              if (isDragging && touchPosition && touchElementRect && !isLocked) {
                const offsetX = touchPosition.x - (touchElementRect.left + touchElementRect.width / 2);
                const offsetY = touchPosition.y - (touchElementRect.top + touchElementRect.height / 2);
                dragTransform = `translate(${offsetX}px, ${offsetY}px) scale(1.08)`;
              } else if (isSnapping) {
                dragTransform = 'translate(0px, 0px) scale(1.02)';
              }
              return (
                <div
                  key={`${index}-${preview.substring(0, 20)}`}
                  data-photo-index={index}
                  className={`relative aspect-square rounded-xl overflow-hidden border cursor-move select-none ${
                    isLight ? 'bg-gray-100' : 'bg-[#1C1C1C]'
                  } ${
                    isDragging
                      ? isLight
                        ? 'opacity-95 z-50 shadow-2xl border-[#3F5331]/50'
                        : 'opacity-95 z-50 shadow-2xl border-[#C8E6A0]/65'
                      : isHovered
                        ? activeRingClass
                        : isSnapping
                          ? isLight
                            ? 'border-[#3F5331]/40'
                            : 'border-[#C8E6A0]/50'
                          : isLight
                            ? 'border-gray-200'
                            : 'border-white/20'
                  }`}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => onDragOver(e, index)}
                  onDragEnd={onDragEnd}
                  onTouchStart={(e) => onTouchStart(e, index)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  style={{
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    transform: dragTransform || undefined,
                    transition:
                      isDragging && !isLocked
                        ? 'box-shadow 0.15s ease-out, border-color 0.15s ease-out'
                        : isSnapping
                          ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out'
                          : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out',
                    willChange: isDragging ? 'transform' : 'auto',
                  }}
                >
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover pointer-events-none"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(index);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70 transition-colors z-10"
                  >
                    <X size={14} className="text-white" />
                  </button>
                </div>
              );
            })}
          </div>
          {imagesCount < maxPhotos && (
            <label
              className={`w-full px-4 py-4 bg-transparent rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                isLight ? 'border-gray-300 hover:border-gray-400' : 'border-white hover:border-white/70'
              }`}
            >
              <Upload size={20} className={`mr-2 ${isLight ? 'text-gray-600' : 'text-white'}`} />
              <span className={`text-sm ${isLight ? 'text-gray-800' : 'text-white'}`}>{addMoreLabel}</span>
              <input type="file" accept="image/*" multiple onChange={onImageChange} className="hidden" />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
