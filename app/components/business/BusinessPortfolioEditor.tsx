'use client';

import { ChevronLeft, ChevronRight, Plus, Upload, X } from 'lucide-react';
import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { compressImageOnClient, getResolvedImageUrl } from '@/utils/imageUtils';
import {
  PORTFOLIO_DESCRIPTION_MAX,
  PORTFOLIO_MAX,
  type PortfolioImageItem,
} from '@/lib/businessProfileSettings';

export type PortfolioDraftItem = {
  id: string;
  preview: string;
  existingUrl?: string;
  file?: File;
  description: string;
};

type BusinessPortfolioEditorProps = {
  items: PortfolioDraftItem[];
  onChange: (items: PortfolioDraftItem[]) => void;
  onError?: (message: string) => void;
  /** Компактний режим для wizard (без зайвих відступів) */
  compact?: boolean;
};

let portfolioIdSeq = 0;

export function createPortfolioDraftId(prefix = 'p'): string {
  portfolioIdSeq += 1;
  return `${prefix}-${portfolioIdSeq}-${Date.now()}`;
}

export function portfolioItemsToDraft(items: PortfolioImageItem[]): PortfolioDraftItem[] {
  return items.map((item, index) => ({
    id: createPortfolioDraftId(`saved-${index}`),
    preview: getResolvedImageUrl(item.url),
    existingUrl: item.url,
    description: item.description || '',
  }));
}

export type PortfolioOrderEntry =
  | { url: string; description?: string }
  | { new: true; description?: string };

export function draftToPortfolioPayload(items: PortfolioDraftItem[]): {
  kept: PortfolioImageItem[];
  order: PortfolioOrderEntry[];
  newFiles: File[];
  newDescriptions: string[];
} {
  const kept: PortfolioImageItem[] = [];
  const order: PortfolioOrderEntry[] = [];
  const newFiles: File[] = [];
  const newDescriptions: string[] = [];

  for (const item of items) {
    const description = item.description.trim().slice(0, PORTFOLIO_DESCRIPTION_MAX) || undefined;
    if (item.file) {
      newFiles.push(item.file);
      newDescriptions.push(description || '');
      order.push(description ? { new: true, description } : { new: true });
      continue;
    }
    if (item.existingUrl) {
      const entry = description
        ? { url: item.existingUrl, description }
        : { url: item.existingUrl };
      kept.push(entry);
      order.push(entry);
    }
  }

  return { kept, order, newFiles, newDescriptions };
}

export function BusinessPortfolioEditor({
  items,
  onChange,
  onError,
  compact = false,
}: BusinessPortfolioEditorProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, PORTFOLIO_MAX - items.length);

  const handlePick = async (files: FileList | null) => {
    if (!files?.length || remaining <= 0) return;
    const next = [...items];
    for (const file of Array.from(files)) {
      if (next.length >= PORTFOLIO_MAX) break;
      try {
        const compressed = await compressImageOnClient(file, 2);
        const preview = URL.createObjectURL(compressed);
        next.push({
          id: createPortfolioDraftId('new'),
          preview,
          file: compressed,
          description: '',
        });
      } catch {
        onError?.(t('businessProfile.validation.photoUploadFailed'));
      }
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (index: number) => {
    const item = items[index];
    if (item?.file && item.preview.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(item.preview);
      } catch {
        /* ignore */
      }
    }
    onChange(items.filter((_, i) => i !== index));
  };

  const moveAt = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    onChange(next);
  };

  const setDescription = (index: number, description: string) => {
    onChange(
      items.map((item, i) =>
        i === index
          ? { ...item, description: description.slice(0, PORTFOLIO_DESCRIPTION_MAX) }
          : item
      )
    );
  };

  const addBtnClass = isLight
    ? 'flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#3F5331]/25 bg-white px-4 py-3.5 text-sm font-semibold text-[#3F5331] transition-colors hover:bg-[#E8F0E0]/50'
    : 'flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/25 bg-transparent px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {remaining > 0 && (
        <label className={addBtnClass}>
          {items.length === 0 ? <Upload size={18} /> : <Plus size={18} />}
          <span>
            {items.length === 0
              ? t('businessProfile.settings.addPortfolioPhotos')
              : t('businessProfile.settings.addMorePortfolioPhotos')}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handlePick(e.target.files)}
          />
        </label>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item, index) => (
            <div key={item.id} className="space-y-1.5">
              <div
                className={`relative aspect-square overflow-hidden rounded-xl border ${
                  isLight ? 'border-gray-200 bg-gray-100' : 'border-white/15 bg-[#1C1C1C]'
                }`}
              >
                <img
                  src={item.preview}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
                  aria-label={t('common.delete')}
                >
                  <X size={14} />
                </button>
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveAt(index, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
                    aria-label={t('common.back')}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => moveAt(index, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
                    aria-label={t('common.next') || 'Next'}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={item.description}
                onChange={(e) => setDescription(index, e.target.value)}
                maxLength={PORTFOLIO_DESCRIPTION_MAX}
                placeholder={t('businessProfile.settings.portfolioCaptionPlaceholder')}
                className={`w-full rounded-lg border px-2 py-1.5 text-[11px] leading-tight ${
                  isLight
                    ? 'border-gray-200 bg-white text-gray-800 placeholder:text-gray-400'
                    : 'border-white/15 bg-transparent text-white placeholder:text-white/40'
                }`}
              />
            </div>
          ))}
        </div>
      )}

      <p className={`text-xs ${ac.mutedText}`}>
        {t('businessProfile.settings.portfolioLimitHint', {
          count: String(items.length),
          max: String(PORTFOLIO_MAX),
        })}
      </p>
    </div>
  );
}
