'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ImageIcon, Trash2, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getCurrencySymbol } from '@/utils/currency';
import type { ListingDraft } from '@/lib/listings/listingDrafts';
import type { TelegramWebApp } from '@/types/telegram';

const BusinessProfileFlow = dynamic(() => import('@/components/business/BusinessProfileFlow'), {
  ssr: false,
});

interface AddListingHubProps {
  drafts: ListingDraft[];
  draftsReady: boolean;
  tg: TelegramWebApp | null;
  telegramId?: string | null;
  onClose: () => void;
  onCreate: () => void;
  onResume: (draft: ListingDraft) => void;
  onDelete: (id: string) => void;
}

function draftPriceLabel(
  draft: ListingDraft,
  t: (key: string) => string
): string {
  if (draft.isFree) return t('common.free');
  if (draft.isNegotiable) return t('common.negotiable');
  if (draft.price.trim()) return `${draft.price.trim()} ${getCurrencySymbol(draft.currency)}`;
  return '';
}

export function AddListingHub({
  drafts,
  draftsReady,
  tg,
  telegramId,
  onClose,
  onCreate,
  onResume,
  onDelete,
}: AddListingHubProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [hasBusiness, setHasBusiness] = useState(false);

  useEffect(() => {
    if (!telegramId) {
      setHasBusiness(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/user/business-profile?telegramId=${encodeURIComponent(telegramId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const name = String(data?.profile?.businessName || '').trim();
        setHasBusiness(Boolean(name));
      })
      .catch(() => {
        if (!cancelled) setHasBusiness(false);
      });
    return () => {
      cancelled = true;
    };
  }, [telegramId, businessOpen]);

  const showDrafts = draftsReady && drafts.length > 0;
  const pageBg = isLight ? 'bg-[#f3f4f6] text-gray-900' : 'bg-black text-white';
  const card = isLight
    ? 'border-gray-200 bg-white'
    : 'border-white/12 bg-white/[0.04]';
  const muted = ac.mutedText;
  const primaryBtn =
    'w-full rounded-2xl bg-[#C8E6A0] px-4 py-3.5 text-base font-semibold text-[#1a1a1a] transition-opacity hover:opacity-90 active:opacity-80';

  const steps = [
    { title: t('createListing.hub.intro.step1Title'), text: t('createListing.hub.intro.step1Text') },
    { title: t('createListing.hub.intro.step2Title'), text: t('createListing.hub.intro.step2Text') },
    { title: t('createListing.hub.intro.step3Title'), text: t('createListing.hub.intro.step3Text') },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-[900] flex flex-col font-montserrat ${pageBg}`}
        style={{ paddingBottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex shrink-0 items-center justify-end px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              isLight ? 'text-gray-500 hover:bg-black/5' : 'text-white/70 hover:bg-white/10'
            }`}
            aria-label={t('common.close')}
          >
            <X size={22} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {!draftsReady ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C8E6A0] border-t-transparent" />
            </div>
          ) : showDrafts ? (
            <div className="mx-auto w-full max-w-lg">
              <h1 className={`text-[1.65rem] font-bold leading-tight ${ac.pageHeading}`}>
                {t('createListing.hub.drafts.title')}
              </h1>
              <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                {t('createListing.hub.drafts.subtitle')}
              </p>
              <h2 className={`mb-2 mt-6 text-sm font-semibold ${ac.pageHeading}`}>
                {t('createListing.hub.drafts.section')}
              </h2>
              <ul className="space-y-2">
                {drafts.map((draft) => {
                  const title = draft.title.trim() || t('createListing.hub.drafts.untitled');
                  const price = draftPriceLabel(draft, t);
                  const thumb = draft.images[0]?.dataUrl;
                  return (
                    <li
                      key={draft.id}
                      className={`flex items-center gap-1 rounded-2xl border py-2 pl-2 pr-1 ${card}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          tg?.HapticFeedback?.impactOccurred?.('light');
                          onResume(draft);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
                            isLight ? 'bg-gray-100' : 'bg-white/10'
                          }`}
                        >
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon size={20} className={isLight ? 'text-gray-400' : 'text-white/40'} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-semibold ${ac.pageHeading}`}>
                            {title}
                          </span>
                          {price ? (
                            <span className={`mt-0.5 block truncate text-xs ${muted}`}>{price}</span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('createListing.hub.drafts.delete')}
                        onClick={() => {
                          tg?.HapticFeedback?.impactOccurred?.('medium');
                          onDelete(draft.id);
                        }}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                          isLight
                            ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                            : 'text-white/40 hover:bg-white/10 hover:text-white/80'
                        }`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  tg?.HapticFeedback?.impactOccurred?.('medium');
                  onCreate();
                }}
                className={`${primaryBtn} mt-5`}
              >
                {t('createListing.hub.create')}
              </button>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-lg flex-col">
              <h1 className={`text-[1.65rem] font-bold leading-tight ${ac.pageHeading}`}>
                {t('createListing.hub.intro.title')}
              </h1>
              <p className={`mt-3 text-sm leading-relaxed ${muted}`}>
                {t('createListing.hub.intro.subtitle')}
              </p>
              <ol className="mt-6 space-y-4">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#C8E6A0] text-sm font-bold text-[#1a1a1a]">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${ac.pageHeading}`}>{step.title}</span>
                      <span className={`mt-0.5 block text-sm leading-relaxed ${muted}`}>{step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => {
                  tg?.HapticFeedback?.impactOccurred?.('medium');
                  onCreate();
                }}
                className={`${primaryBtn} mt-7`}
              >
                {t('createListing.hub.create')}
              </button>
              {!hasBusiness && (
                <div
                  className={`mt-8 rounded-2xl border border-dashed px-4 py-3.5 ${
                    isLight ? 'border-gray-300 bg-white/70' : 'border-white/15 bg-white/[0.03]'
                  }`}
                >
                  <p className={`text-sm font-medium ${ac.pageHeading}`}>
                    {t('createListing.hub.business.title')}
                  </p>
                  <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
                    {t('createListing.hub.business.text')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!telegramId) return;
                      tg?.HapticFeedback?.impactOccurred?.('light');
                      setBusinessOpen(true);
                    }}
                    className={`mt-2 text-sm font-semibold underline-offset-2 hover:underline ${
                      isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'
                    }`}
                  >
                    {t('createListing.hub.business.cta')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {telegramId && (
        <BusinessProfileFlow
          isOpen={businessOpen}
          onClose={() => setBusinessOpen(false)}
          onSuccess={() => {
            setHasBusiness(true);
            setBusinessOpen(false);
          }}
          tg={tg}
          telegramId={telegramId}
        />
      )}
    </>
  );
}
