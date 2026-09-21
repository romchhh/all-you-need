'use client';

import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import {
  BUSINESS_SPHERE_IDS,
  MAX_BUSINESS_DIRECTIONS,
  getBusinessDirectionLabel,
  getBusinessSphereLabel,
  getDirectionsForSphere,
  isCustomDirection,
  normalizeBusinessDirections,
  toCustomDirection,
} from '@/lib/businessSphereConstants';

type BusinessSphereFieldsProps = {
  sphere: string;
  directions: string[];
  onSphereChange: (sphere: string) => void;
  onDirectionsChange: (directions: string[]) => void;
};

export function BusinessSphereFields({
  sphere,
  directions,
  onSphereChange,
  onDirectionsChange,
}: BusinessSphereFieldsProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);
  const [customDraft, setCustomDraft] = useState('');

  const availableDirections = useMemo(() => getDirectionsForSphere(sphere), [sphere]);
  const lang = language === 'ru' ? 'ru' : 'uk';
  const canAddMore = directions.length < MAX_BUSINESS_DIRECTIONS;

  const inputCls = isLight
    ? 'w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:border-[#3F5331]'
    : 'w-full rounded-2xl border border-white/10 bg-[#1C1C1C] px-4 py-3 text-sm text-white outline-none focus:border-[#C8E6A0]';

  const labelCls = isLight
    ? 'mb-1.5 block text-sm font-medium text-gray-700'
    : 'mb-1.5 block text-sm font-medium text-white/80';

  const toggleDirection = (directionId: string) => {
    if (directions.includes(directionId)) {
      onDirectionsChange(directions.filter((id) => id !== directionId));
      return;
    }
    if (!canAddMore) return;
    onDirectionsChange(normalizeBusinessDirections(sphere, [...directions, directionId]));
  };

  const removeDirection = (directionId: string) => {
    onDirectionsChange(directions.filter((id) => id !== directionId));
  };

  const addCustomDirection = () => {
    const custom = toCustomDirection(customDraft);
    if (!custom || !canAddMore) return;
    if (directions.includes(custom)) {
      setCustomDraft('');
      return;
    }
    onDirectionsChange(normalizeBusinessDirections(sphere, [...directions, custom]));
    setCustomDraft('');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>{t('businessProfile.fields.sphere')} *</label>
        <select
          className={inputCls}
          value={sphere}
          onChange={(e) => {
            onSphereChange(e.target.value);
            onDirectionsChange([]);
            setCustomDraft('');
          }}
        >
          <option value="">{t('businessProfile.fields.selectSphere')}</option>
          {BUSINESS_SPHERE_IDS.map((id) => (
            <option key={id} value={id}>
              {getBusinessSphereLabel(id, lang)}
            </option>
          ))}
        </select>
      </div>

      {sphere ? (
        <>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className={labelCls.replace('mb-1.5 ', '')}>
                {t('businessProfile.fields.directions')} *
              </label>
              <span className={`text-xs ${ac.mutedText}`}>
                {directions.length}/{MAX_BUSINESS_DIRECTIONS}
              </span>
            </div>
            <p className={`mb-2 text-xs ${ac.mutedText}`}>{t('businessProfile.fields.directionsHint')}</p>

            {directions.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {directions.map((directionId) => (
                  <span
                    key={directionId}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                      isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
                    }`}
                  >
                    {getBusinessDirectionLabel(directionId, lang)}
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => removeDirection(directionId)}
                      className="rounded-full p-0.5 hover:bg-black/10"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {availableDirections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableDirections.map((directionId) => {
                  const selected = directions.includes(directionId);
                  const disabled = !selected && !canAddMore;
                  return (
                    <button
                      key={directionId}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleDirection(directionId)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                        selected
                          ? isLight
                            ? 'bg-[#3F5331] text-white'
                            : 'bg-[#C8E6A0] text-[#141414]'
                          : isLight
                            ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                      }`}
                    >
                      {getBusinessDirectionLabel(directionId, lang)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={`text-xs ${ac.mutedText}`}>{t('businessProfile.fields.directionsOtherHint')}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>{t('businessProfile.fields.customDirection')}</label>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={customDraft}
                maxLength={60}
                disabled={!canAddMore}
                placeholder={t('businessProfile.fields.customDirectionPlaceholder')}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomDirection();
                  }
                }}
              />
              <button
                type="button"
                disabled={!canAddMore || !customDraft.trim()}
                onClick={addCustomDirection}
                className={`${ui.btnOutline} shrink-0 px-3`}
              >
                <Plus size={16} />
                {t('businessProfile.fields.addDirection')}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
