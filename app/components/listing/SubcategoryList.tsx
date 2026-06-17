'use client';

import { Subcategory } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useLayoutEffect, useRef } from 'react';

interface SubcategoryListProps {
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSelect: (subcategoryId: string | null) => void;
  tg: TelegramWebApp | null;
  categoryId?: string | null;
}

const ALL_CHIP_KEY = '__all__';

export const SubcategoryList = ({
  subcategories,
  selectedSubcategory,
  onSelect,
  tg,
  categoryId,
}: SubcategoryListProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const subIdle = ac.subcategoryIdle;
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const chipActive = isLight
    ? 'border-2 border-[#3F5331] bg-[#3F5331]/18 text-[#3F5331] font-semibold shadow-sm ring-1 ring-[#3F5331]/15'
    : `border border-[#C8E6A0] font-semibold ${ac.formChipSelected}`;

  const registerChipRef = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) {
      chipRefs.current.set(key, node);
    } else {
      chipRefs.current.delete(key);
    }
  };

  const scrollActiveChipIntoView = () => {
    const key = selectedSubcategory ?? ALL_CHIP_KEY;
    const chip = chipRefs.current.get(key);
    if (!chip) return;
    chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  useLayoutEffect(() => {
    scrollActiveChipIntoView();
    const id = window.requestAnimationFrame(scrollActiveChipIntoView);
    return () => window.cancelAnimationFrame(id);
  }, [selectedSubcategory, categoryId, subcategories.length]);

  if (!subcategories || subcategories.length === 0) return null;

  const isServicesWork = categoryId === 'services_work';
  const workSubcategories = ['vacancies', 'part_time', 'looking_for_work', 'other_work'];
  const servicesSubcategories = isServicesWork
    ? subcategories.filter((sub) => !workSubcategories.includes(sub.id))
    : subcategories;
  const workSubcategoriesList = isServicesWork
    ? subcategories.filter((sub) => workSubcategories.includes(sub.id))
    : [];

  const renderAllChip = () => (
    <button
      ref={registerChipRef(ALL_CHIP_KEY)}
      type="button"
      onClick={() => {
        onSelect(null);
        tg?.HapticFeedback.impactOccurred('light');
      }}
      className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
        selectedSubcategory === null ? chipActive : subIdle
      }`}
    >
      {t('common.all')}
    </button>
  );

  const renderSubcategoryButton = (subcategory: Subcategory) => (
    <button
      key={subcategory.id}
      ref={registerChipRef(subcategory.id)}
      type="button"
      onClick={() => {
        onSelect(subcategory.id);
        tg?.HapticFeedback.impactOccurred('light');
      }}
      className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
        selectedSubcategory === subcategory.id ? chipActive : subIdle
      }`}
    >
      {subcategory.name}
    </button>
  );

  const scrollRowClass =
    'overflow-x-auto -mx-4 w-full scrollbar-hide';
  const scrollRowStyle = {
    maxWidth: '100vw' as const,
    WebkitOverflowScrolling: 'touch' as const,
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
    paddingLeft: '16px',
  };

  if (isServicesWork && workSubcategoriesList.length > 0) {
    return (
      <div className="mb-4">
        <div className={scrollRowClass} style={scrollRowStyle}>
          <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
            {renderAllChip()}
            {servicesSubcategories.map(renderSubcategoryButton)}
          </div>
          <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
            {workSubcategoriesList.map(renderSubcategoryButton)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className={scrollRowClass} style={scrollRowStyle}>
        <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content', width: 'max-content' }}>
          {renderAllChip()}
          {subcategories.map(renderSubcategoryButton)}
        </div>
      </div>
    </div>
  );
};
