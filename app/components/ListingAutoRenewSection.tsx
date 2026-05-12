'use client';

import { Info, Loader2 } from 'lucide-react';
import { useListingAutoRenew } from '@/hooks/useListingAutoRenew';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import type { TelegramWebApp } from '@/types/telegram';
import type { ToastType } from '@/hooks/useToast';

type ListingAutoRenewSectionProps = {
  listingId: number;
  serverAutoRenew: boolean | undefined;
  viewerTelegramId: string;
  isLight: boolean;
  /** Той самий `showToast`, що й у батьківській сторінці / `ListingDetail` (локальний стан тоста). */
  showToast: (message: string, type?: ToastType) => void;
  onPersistSuccess?: (next: boolean) => void;
  tg?: TelegramWebApp | null;
  /** Вузький рядок (картка в профілі). */
  compact?: boolean;
};

export function ListingAutoRenewSection({
  listingId,
  serverAutoRenew,
  viewerTelegramId,
  isLight,
  showToast,
  onPersistSuccess,
  tg,
  compact = false,
}: ListingAutoRenewSectionProps) {
  const { t } = useLanguage();
  const ac = getAppearanceClasses(isLight);
  const { autoRenewLocal, autoRenewSaving, pendingAutoRenewOff, setPendingAutoRenewOff, persistAutoRenew } =
    useListingAutoRenew({ listingId, serverAutoRenew, onPersistSuccess });

  const haptic = (kind: 'success' | 'error') => {
    if (kind === 'success') tg?.HapticFeedback?.impactOccurred('light');
    else tg?.HapticFeedback?.notificationOccurred('error');
  };

  const shell = compact
    ? `rounded-lg border px-2 py-1.5 ${
        isLight ? 'border-gray-200/90 bg-white/90 text-gray-900' : 'border-white/15 bg-black/40 text-white/90'
      }`
    : `rounded-2xl border p-4 sm:p-5 ${
        isLight ? 'border-gray-200/90 bg-white/90 shadow-sm ring-1 ring-black/[0.03]' : 'border-white/12 bg-white/[0.04]'
      }`;

  if (pendingAutoRenewOff) {
    return (
      <div className={shell} role="group" aria-label={t('sales.autoRenewOffAsk')}>
        <div className={`flex flex-col gap-2 ${compact ? '' : 'sm:flex-row sm:items-center sm:justify-between sm:gap-3'}`}>
          <p className={`text-sm font-medium leading-snug ${isLight ? 'text-amber-900' : 'text-amber-100/95'}`}>
            {t('sales.autoRenewOffAsk')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={autoRenewSaving}
              onClick={async () => {
                const ok = await persistAutoRenew(viewerTelegramId, false);
                if (ok) {
                  setPendingAutoRenewOff(false);
                  showToast(t('sales.autoRenewSaved'), 'success');
                  haptic('success');
                } else {
                  showToast(t('sales.autoRenewError'), 'error');
                  haptic('error');
                }
              }}
              className={`inline-flex min-h-[40px] items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                isLight ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-500/90 text-white hover:bg-red-500'
              }`}
            >
              {autoRenewSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t('sales.autoRenewDisable')}
            </button>
            <button
              type="button"
              disabled={autoRenewSaving}
              onClick={() => setPendingAutoRenewOff(false)}
              className={`inline-flex min-h-[40px] items-center justify-center rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                isLight
                  ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                  : 'border border-white/25 bg-black/30 text-white/90 hover:bg-white/10'
              }`}
            >
              {t('sales.autoRenewKeepOn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {!compact && (
        <div className="mb-3">
          <h3 className={`text-sm font-semibold sm:text-base ${ac.pageHeading}`}>{t('sales.autoRenew')}</h3>
          <p className={`mt-1 text-xs leading-relaxed sm:text-sm ${ac.mutedText}`}>{t('sales.autoRenewHint')}</p>
        </div>
      )}
      <div className="flex items-start gap-3">
        <label
          className={`flex min-h-[44px] flex-1 cursor-pointer select-none items-center gap-3 ${compact ? '' : 'sm:min-h-0'}`}
        >
          <input
            type="checkbox"
            role="switch"
            aria-checked={autoRenewLocal}
            className={`h-4 w-4 shrink-0 rounded border accent-[#3F5331] focus:ring-2 focus:ring-[#3F5331]/30 ${
              isLight ? 'border-gray-300 bg-white' : 'border-white/40 bg-black/40 accent-[#C8E6A0]'
            }`}
            checked={autoRenewLocal}
            disabled={autoRenewSaving}
            onChange={async (e) => {
              const next = e.target.checked;
              if (!next && autoRenewLocal) {
                setPendingAutoRenewOff(true);
                return;
              }
              const ok = await persistAutoRenew(viewerTelegramId, next);
              if (ok) {
                showToast(t('sales.autoRenewSaved'), 'success');
                haptic('success');
              } else {
                showToast(t('sales.autoRenewError'), 'error');
                haptic('error');
              }
            }}
          />
          <span className={`min-w-0 flex-1 text-sm font-medium leading-snug ${ac.pageHeading}`}>{t('sales.autoRenewShort')}</span>
        </label>
        <span
          className={`mt-0.5 inline-flex shrink-0 ${isLight ? 'text-gray-400' : 'text-white/45'}`}
          title={t('sales.autoRenewHint')}
          aria-label={t('sales.autoRenewHint')}
        >
          <Info className={compact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.25} />
        </span>
        {autoRenewSaving && <Loader2 className={`mt-1 h-4 w-4 shrink-0 animate-spin ${ac.mutedText}`} aria-hidden />}
      </div>
    </div>
  );
}
