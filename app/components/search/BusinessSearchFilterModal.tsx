'use client';

import { ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import {
  BUSINESS_SPHERE_IDS,
  getBusinessDirectionLabel,
  getBusinessSphereLabel,
  getDirectionsForSphere,
  isValidBusinessSphere,
} from '@/lib/businessSphereConstants';
import type { BusinessSearchSort } from '@/lib/business/businessSearchHelpers';

export type BusinessSearchFilterState = {
  sortBy: BusinessSearchSort;
  sphere: string | null;
  direction: string | null;
  hasPhysicalAddress: boolean;
  travelsToClient: boolean;
  worksOnline: boolean;
  minRating: null | 4 | 4.5;
};

export const DEFAULT_BUSINESS_SEARCH_FILTERS: BusinessSearchFilterState = {
  sortBy: 'relevance',
  sphere: null,
  direction: null,
  hasPhysicalAddress: false,
  travelsToClient: false,
  worksOnline: false,
  minRating: null,
};

type BusinessSearchFilterModalProps = {
  isOpen: boolean;
  filters: BusinessSearchFilterState;
  onClose: () => void;
  onApply: (filters: BusinessSearchFilterState) => void;
  tg: TelegramWebApp | null;
};

export function BusinessSearchFilterModal({
  isOpen,
  filters,
  onClose,
  onApply,
  tg,
}: BusinessSearchFilterModalProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  useHideBottomNav(isOpen);
  useBodyScrollLock(isOpen);

  const [local, setLocal] = useState<BusinessSearchFilterState>(filters);
  const [sphereSheetOpen, setSphereSheetOpen] = useState(false);
  const [directionSheetOpen, setDirectionSheetOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocal(filters);
      setSphereSheetOpen(false);
      setDirectionSheetOpen(false);
    }
  }, [isOpen, filters]);

  const lang = language === 'ru' ? 'ru' : 'uk';
  const directionOptions = useMemo(() => {
    if (!local.sphere || !isValidBusinessSphere(local.sphere)) return [];
    return getDirectionsForSphere(local.sphere);
  }, [local.sphere]);

  const chipActive = isLight
    ? 'border-2 border-[#3F5331] bg-[#3F5331]/15 text-[#3F5331] font-semibold'
    : `border border-[#C8E6A0] font-semibold ${ac.formChipSelected}`;
  const chipIdle = isLight
    ? 'border border-gray-300 text-gray-800 bg-transparent hover:bg-gray-100'
    : 'border border-white text-white bg-transparent hover:bg-white/10';

  const sheetBackground = isLight
    ? 'radial-gradient(ellipse 85% 100% at 18% 0%, rgba(63, 83, 49, 0.14) 0%, transparent 45%), linear-gradient(180deg, #ffffff 0%, #f6f8f4 100%)'
    : 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000';

  if (!isOpen) return null;

  const sphereLabel = local.sphere
    ? getBusinessSphereLabel(local.sphere, lang)
    : t('bazaar.search.businessFilters.allSpheres');
  const directionLabel = local.direction
    ? getBusinessDirectionLabel(local.direction, lang) || local.direction
    : t('bazaar.search.businessFilters.allDirections');

  const handleReset = () => {
    setLocal(DEFAULT_BUSINESS_SEARCH_FILTERS);
    onApply(DEFAULT_BUSINESS_SEARCH_FILTERS);
    tg?.HapticFeedback?.impactOccurred?.('light');
    onClose();
  };

  const renderPickerSheet = (
    open: boolean,
    title: string,
    onCloseSheet: () => void,
    options: Array<{ id: string | null; label: string }>,
    selectedId: string | null,
    onSelect: (id: string | null) => void
  ) => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50" onClick={onCloseSheet}>
        <div
          className="max-h-[70vh] w-full max-w-lg overflow-hidden rounded-t-3xl"
          style={{ background: sheetBackground }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <h3 className={`text-base font-semibold ${ac.pageHeading}`}>{title}</h3>
            <button type="button" onClick={onCloseSheet} className={ac.mutedText}>
              <X size={20} />
            </button>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-4">
            {options.map((option) => (
              <button
                key={option.id ?? 'all'}
                type="button"
                onClick={() => {
                  onSelect(option.id);
                  onCloseSheet();
                  tg?.HapticFeedback?.impactOccurred?.('light');
                }}
                className={`mb-2 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                  selectedId === option.id
                    ? isLight
                      ? 'bg-[#3F5331]/10 text-[#3F5331]'
                      : 'bg-[#C8E6A0]/10 text-[#C8E6A0]'
                    : ac.pageHeading
                }`}
              >
                <span className="text-sm font-medium">{option.label}</span>
                {selectedId === option.id && <ChevronRight size={16} className="rotate-180 opacity-60" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-t-3xl"
          style={{ background: sheetBackground }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <h3 className={`text-base font-semibold ${ac.pageHeading}`}>{t('common.filter')}</h3>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className={ac.mutedText}>
              <X size={20} />
            </button>
          </div>

          <div className="max-h-[calc(90vh-8rem)] space-y-6 overflow-y-auto px-4 py-4">
            <section className="space-y-3">
              <h4 className={`text-sm font-semibold ${ac.pageHeading}`}>
                {t('bazaar.search.businessFilters.sort')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {(['relevance', 'rating'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocal((prev) => ({ ...prev, sortBy: value }))}
                    className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                      local.sortBy === value ? chipActive : chipIdle
                    }`}
                  >
                    {value === 'relevance'
                      ? t('bazaar.search.businessFilters.byRelevance')
                      : t('bazaar.search.businessFilters.byRating')}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h4 className={`text-sm font-semibold ${ac.pageHeading}`}>
                {t('businessProfile.fields.sphere')}
              </h4>
              <button
                type="button"
                onClick={() => setSphereSheetOpen(true)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${
                  isLight ? 'border-gray-300 bg-white' : 'border-white/20 bg-transparent'
                }`}
              >
                <span className={ac.pageHeading}>{sphereLabel}</span>
                <ChevronRight size={18} className={ac.mutedText} />
              </button>
            </section>

            <section className="space-y-2">
              <h4 className={`text-sm font-semibold ${ac.pageHeading}`}>
                {t('businessProfile.fields.directions')}
              </h4>
              <button
                type="button"
                disabled={!local.sphere}
                onClick={() => setDirectionSheetOpen(true)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm disabled:opacity-50 ${
                  isLight ? 'border-gray-300 bg-white' : 'border-white/20 bg-transparent'
                }`}
              >
                <span className={ac.pageHeading}>{directionLabel}</span>
                <ChevronRight size={18} className={ac.mutedText} />
              </button>
            </section>

            <section className="space-y-3">
              <h4 className={`text-sm font-semibold ${ac.pageHeading}`}>
                {t('bazaar.search.businessFilters.workFormat')}
              </h4>
              {(
                [
                  ['hasPhysicalAddress', 'physicalAddress'],
                  ['travelsToClient', 'travelsToClient'],
                  ['worksOnline', 'worksOnline'],
                ] as const
              ).map(([key, labelKey]) => (
                <label key={key} className={`flex items-center gap-3 text-sm ${ac.pageHeading}`}>
                  <input
                    type="checkbox"
                    checked={local[key]}
                    onChange={(e) => setLocal((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {t(`bazaar.search.businessFilters.${labelKey}`)}
                </label>
              ))}
            </section>

            <section className="space-y-3">
              <h4 className={`text-sm font-semibold ${ac.pageHeading}`}>
                {t('bazaar.search.businessFilters.rating')}
              </h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setLocal((prev) => ({ ...prev, minRating: null }))}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    local.minRating === null ? chipActive : chipIdle
                  }`}
                >
                  {t('bazaar.search.businessFilters.ratingAny')}
                </button>
                <button
                  type="button"
                  onClick={() => setLocal((prev) => ({ ...prev, minRating: 4 }))}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    local.minRating === 4 ? chipActive : chipIdle
                  }`}
                >
                  4.0+
                </button>
                <button
                  type="button"
                  onClick={() => setLocal((prev) => ({ ...prev, minRating: 4.5 }))}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    local.minRating === 4.5 ? chipActive : chipIdle
                  }`}
                >
                  4.5+
                </button>
              </div>
            </section>
          </div>

          <div className="flex gap-3 border-t border-black/5 px-4 py-4">
            <button
              type="button"
              onClick={handleReset}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold ${
                isLight ? 'border-gray-300 text-gray-800' : 'border-white/25 text-white'
              }`}
            >
              {t('bazaar.search.businessFilters.reset')}
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(local);
                tg?.HapticFeedback?.impactOccurred?.('light');
                onClose();
              }}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${
                isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#111]'
              }`}
            >
              {t('bazaar.search.businessFilters.apply')}
            </button>
          </div>
        </div>
      </div>

      {renderPickerSheet(
        sphereSheetOpen,
        t('businessProfile.fields.sphere'),
        () => setSphereSheetOpen(false),
        [
          { id: null, label: t('bazaar.search.businessFilters.allSpheres') },
          ...BUSINESS_SPHERE_IDS.map((id) => ({
            id,
            label: getBusinessSphereLabel(id, lang) || id,
          })),
        ],
        local.sphere,
        (sphere) =>
          setLocal((prev) => ({
            ...prev,
            sphere,
            direction: sphere === prev.sphere ? prev.direction : null,
          }))
      )}

      {renderPickerSheet(
        directionSheetOpen,
        t('businessProfile.fields.directions'),
        () => setDirectionSheetOpen(false),
        [
          { id: null, label: t('bazaar.search.businessFilters.allDirections') },
          ...directionOptions.map((id) => ({
            id,
            label: getBusinessDirectionLabel(id, lang) || id,
          })),
        ],
        local.direction,
        (direction) => setLocal((prev) => ({ ...prev, direction }))
      )}
    </>
  );
}
