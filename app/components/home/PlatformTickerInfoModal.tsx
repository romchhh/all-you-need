'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import {
  ONBOARDING_SECTIONS,
  type PlatformOnboardingActionId,
  type TickerMessageType,
} from '@/utils/platformTickerMessages';

type PlatformTickerInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  highlightType?: TickerMessageType | null;
  onAction: (action: PlatformOnboardingActionId) => void;
};

export function PlatformTickerInfoModal({
  isOpen,
  onClose,
  highlightType,
  onAction,
}: PlatformTickerInfoModalProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!mounted || !isOpen || typeof document === 'undefined') {
    return null;
  }

  const panelClass = isLight
    ? 'bg-white border-t border-gray-200/90 shadow-[0_-8px_40px_rgba(0,0,0,0.12)]'
    : 'bg-[#121212] border-t border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.55)]';

  const handleAction = (action: PlatformOnboardingActionId) => {
    onAction(action);
    onClose();
  };

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-[9998] cursor-default bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        id="platform-ticker-info-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-ticker-info-title"
        className={`fixed inset-x-0 bottom-0 z-[9999] flex max-h-[min(88vh,720px)] flex-col rounded-t-3xl ${panelClass}`}
      >
        <div
          className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 pb-3 pt-4 ${
            isLight ? 'border-gray-100' : 'border-white/10'
          }`}
        >
          <div className="min-w-0 pr-1">
            <h2
              id="platform-ticker-info-title"
              className={`text-base font-bold ${ac.pageHeading}`}
            >
              {t('platformTicker.onboarding.brandTitle')}
            </h2>
            <p className={`mt-1 text-sm leading-relaxed ${ac.mutedText}`}>
              {t('platformTicker.onboarding.intro')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
              isLight
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <ul className="space-y-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {ONBOARDING_SECTIONS.map((section) => {
              const isHighlighted =
                highlightType != null && section.highlightTypes.includes(highlightType);

              return (
                <li
                  key={section.id}
                  className={`rounded-2xl px-3.5 py-3 ${
                    isHighlighted
                      ? isLight
                        ? 'bg-[#C8E6A0]/40 ring-1 ring-[#3F5331]/15'
                        : 'bg-[#C8E6A0]/10 ring-1 ring-[#C8E6A0]/20'
                      : isLight
                        ? 'bg-gray-50/80'
                        : 'bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xl leading-none" aria-hidden>
                      {section.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold leading-snug ${ac.pageHeading}`}>
                        {t(section.titleKey)}
                      </p>
                      <p className={`mt-1 text-xs leading-relaxed ${ac.mutedText}`}>
                        {t(section.descriptionKey)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleAction(section.id)}
                        className="mt-2.5 inline-flex min-h-[36px] items-center justify-center rounded-xl bg-[#3F5331] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#344728] active:scale-[0.98]"
                      >
                        {t(section.buttonKey)}
                      </button>
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
