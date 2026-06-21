'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import {
  TICKER_CATEGORIES_INFO,
  type TickerMessageType,
} from '@/utils/platformTickerMessages';

type PopoverPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type PlatformTickerInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  highlightType?: TickerMessageType | null;
};

const POPOVER_GAP = 8;
const VIEWPORT_PADDING = 12;

export function PlatformTickerInfoModal({
  isOpen,
  onClose,
  anchorRef,
  highlightType,
}: PlatformTickerInfoModalProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - VIEWPORT_PADDING * 2);
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, rect.left),
      window.innerWidth - width - VIEWPORT_PADDING
    );
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const preferredMax = Math.min(420, window.innerHeight * 0.62);
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      160,
      Math.min(preferredMax, openUp ? spaceAbove - POPOVER_GAP : spaceBelow - POPOVER_GAP)
    );
    const top = openUp
      ? Math.max(VIEWPORT_PADDING, rect.top - POPOVER_GAP - maxHeight)
      : rect.bottom + POPOVER_GAP;

    setPosition({ top, left, width, maxHeight });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      const panel = document.getElementById('platform-ticker-info-panel');
      if (panel?.contains(target)) return;
      onClose();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside, { passive: true });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!mounted || !isOpen || !position || typeof document === 'undefined') {
    return null;
  }

  const panelClass = isLight
    ? 'overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xl shadow-gray-900/10 ring-1 ring-black/[0.04]'
    : 'overflow-hidden rounded-2xl border border-white/15 bg-[#121212] shadow-2xl shadow-black/40';

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-[9998] cursor-default bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        id="platform-ticker-info-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-ticker-info-title"
        className={panelClass}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
          zIndex: 9999,
        }}
      >
        <div
          className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${
            isLight ? 'border-gray-100 bg-[#f6f8f4]/80' : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          <div className="min-w-0 pr-1">
            <h2
              id="platform-ticker-info-title"
              className={`text-sm font-semibold ${ac.pageHeading}`}
            >
              {t('platformTicker.info.title')}
            </h2>
            <p className={`mt-0.5 text-xs leading-snug ${ac.mutedText}`}>
              {t('platformTicker.info.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
              isLight
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="overflow-y-auto overscroll-contain px-3 py-2"
          style={{ maxHeight: Math.max(120, position.maxHeight - 72) }}
        >
          <ul className="space-y-1.5">
            {TICKER_CATEGORIES_INFO.map((category) => {
              const isHighlighted = highlightType === category.type;

              return (
                <li
                  key={category.type}
                  className={`rounded-xl px-3 py-2.5 ${
                    isHighlighted
                      ? isLight
                        ? 'bg-[#C8E6A0]/45 ring-1 ring-[#3F5331]/15'
                        : 'bg-[#C8E6A0]/10 ring-1 ring-[#C8E6A0]/20'
                      : isLight
                        ? 'hover:bg-gray-50'
                        : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-base leading-none" aria-hidden>
                      {category.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-sm font-medium ${ac.pageHeading}`}>
                          {t(category.titleKey)}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                            isLight
                              ? 'bg-[#3F5331]/10 text-[#3F5331]'
                              : 'bg-white/10 text-white/75'
                          }`}
                        >
                          {category.sharePercent}%
                        </span>
                        {isHighlighted && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                              isLight
                                ? 'bg-[#3F5331] text-white'
                                : 'bg-[#C8E6A0] text-[#0f1408]'
                            }`}
                          >
                            {t('platformTicker.info.currentCategory')}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 text-xs leading-relaxed ${ac.mutedText}`}>
                        {t(category.descriptionKey)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>,
    document.body
  );
}
