'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import {
  TICKER_CATEGORIES_INFO,
  type TickerMessageType,
} from '@/utils/platformTickerMessages';

type PlatformTickerInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  highlightType?: TickerMessageType | null;
};

export function PlatformTickerInfoModal({
  isOpen,
  onClose,
  highlightType,
}: PlatformTickerInfoModalProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const sheetBackground = isLight
    ? 'radial-gradient(ellipse 85% 100% at 18% 0%, rgba(63, 83, 49, 0.14) 0%, transparent 45%), linear-gradient(180deg, #ffffff 0%, #f6f8f4 100%)'
    : 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000';

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden bg-black/50 backdrop-blur-sm md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-full flex-col animate-slide-up rounded-t-3xl border-t-2 md:max-h-[85vh] md:max-w-lg md:rounded-2xl md:border-2 ${
          isLight ? 'border-gray-200 md:border-gray-200' : 'border-white md:border-white/25'
        }`}
        onClick={(event) => event.stopPropagation()}
        style={{ background: sheetBackground }}
      >
        <div className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-white/30 md:hidden" />

        <div className={`flex items-start justify-between gap-3 border-b px-4 pb-4 pt-5 md:px-6 ${isLight ? 'border-gray-200' : 'border-white/15'}`}>
          <div className="min-w-0">
            <h2 className={`text-lg font-bold ${ac.pageHeading}`}>{t('platformTicker.info.title')}</h2>
            <p className={`mt-1 text-sm ${ac.mutedText}`}>{t('platformTicker.info.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
              isLight
                ? 'border-gray-300 text-gray-800 hover:bg-gray-100'
                : 'border-white/20 text-white hover:bg-white/10'
            }`}
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
          <div className="space-y-3">
            {TICKER_CATEGORIES_INFO.map((category) => {
              const isHighlighted = highlightType === category.type;
              const exampleKeys = category.dynamicMessageKeys ?? category.messageKeys;

              return (
                <section
                  key={category.type}
                  className={`rounded-2xl border p-4 ${
                    isHighlighted
                      ? isLight
                        ? 'border-[#3F5331]/40 bg-[#C8E6A0]/35 ring-1 ring-[#3F5331]/15'
                        : 'border-[#C8E6A0]/40 bg-[#C8E6A0]/10 ring-1 ring-[#C8E6A0]/20'
                      : isLight
                        ? 'border-gray-200 bg-white/80'
                        : 'border-white/15 bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none" aria-hidden>
                      {category.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-sm font-semibold ${ac.pageHeading}`}>{t(category.titleKey)}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-white/10 text-white/80'
                          }`}
                        >
                          {category.sharePercent}%
                        </span>
                        {isHighlighted && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                            }`}
                          >
                            {t('platformTicker.info.currentCategory')}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1.5 text-sm leading-relaxed ${ac.mutedText}`}>
                        {t(category.descriptionKey)}
                      </p>
                      {exampleKeys.length > 0 && (
                        <ul className={`mt-3 space-y-1.5 text-sm ${isLight ? 'text-gray-800' : 'text-white/90'}`}>
                          {exampleKeys.map((key) => (
                            <li key={key} className="flex gap-2">
                              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${isLight ? 'bg-[#3F5331]/50' : 'bg-[#C8E6A0]/70'}`} />
                              <span>{t(key)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className={`border-t px-4 py-4 md:px-6 ${isLight ? 'border-gray-200' : 'border-white/15'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-2xl py-3 text-sm font-semibold transition-colors ${
              isLight
                ? 'bg-[#3F5331] text-white hover:bg-[#354629]'
                : 'bg-[#C8E6A0] text-[#0f1408] hover:bg-[#b8d890]'
            }`}
          >
            {t('platformTicker.info.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
