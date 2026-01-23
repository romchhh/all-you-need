import { ArrowLeft, Search, SlidersHorizontal, Share2, X, Heart } from 'lucide-react';
import React from 'react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';

interface TopBarProps {
  variant: 'main' | 'detail' | 'profile';
  onBack?: () => void;
  onSearchChange?: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
  onFilterClick?: () => void;
  onShareClick?: () => void;
  onFavoriteClick?: () => void;
  isFavorite?: boolean;
  searchQuery?: string;
  searchPlaceholder?: string;
  title?: string;
  hasActiveFilters?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onSearchClear?: () => void;
  tg: TelegramWebApp | null;
  searchSuggestions?: React.ReactNode;
}

export const TopBar = ({
  variant,
  onBack,
  onSearchChange,
  onSearchSubmit,
  onFilterClick,
  onShareClick,
  onFavoriteClick,
  isFavorite = false,
  searchQuery = '',
  searchPlaceholder,
  title,
  hasActiveFilters = false,
  searchInputRef,
  onSearchClear,
  tg,
  searchSuggestions
}: TopBarProps) => {
  const { t } = useLanguage();

  if (variant === 'main') {
    return (
      <div className="flex gap-1 items-center flex-1">
        <div className="relative flex-1">
          <Search 
            className="absolute top-1/2 -translate-y-1/2 text-white/80" 
            size={18} 
            style={{ left: '16px' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={searchPlaceholder || t('bazaar.whatInterestsYou')}
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Search') {
                e.preventDefault();
                const query = searchQuery.trim();
                if (query && onSearchSubmit) {
                  onSearchSubmit(query);
                }
              }
            }}
            onFocus={() => {
              // Можна додати логіку для показу підказок
            }}
            className="w-full pr-10 py-3 bg-transparent rounded-xl border border-white focus:outline-none focus:ring-2 focus:ring-white/50 transition-all text-white placeholder:text-white/60"
            style={{ 
              paddingLeft: '44px',
              fontSize: '16px' // Запобігаємо зуму на iOS при фокусі
            }}
          />
          {searchQuery && onSearchClear && (
            <button
              onClick={() => {
                onSearchClear();
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X size={14} className="text-white" />
            </button>
          )}
          
          {/* Підказки автодоповнення - позиціоновані під полем вводу */}
          {searchSuggestions}
        </div>
        <button
          onClick={() => {
            onFilterClick?.();
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="relative w-12 h-12 rounded-xl bg-transparent border border-white flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <SlidersHorizontal size={18} className="text-white" />
          {hasActiveFilters && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#D3F1A7] rounded-full"></span>
          )}
        </button>
      </div>
    );
  }

  if (variant === 'detail' || variant === 'profile') {
    return (
      <div className="w-full">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              onBack?.();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-900" />
          </button>
          {title && (
            <h1 className="flex-1 text-center text-lg font-bold text-gray-900 px-4 truncate">
              {title}
            </h1>
          )}
          <div className="flex items-center gap-2">
            {variant === 'detail' && onFavoriteClick && (
              <button
                onClick={() => {
                  onFavoriteClick();
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Heart 
                  size={20} 
                  className={isFavorite ? 'text-red-500' : 'text-gray-600'}
                  fill={isFavorite ? 'currentColor' : 'none'}
                />
              </button>
            )}
            {onShareClick && (
              <button
                onClick={() => {
                  onShareClick();
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Share2 size={20} className="text-gray-900" />
              </button>
            )}
            {!onShareClick && !(variant === 'detail' && onFavoriteClick) && <div className="w-10"></div>}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

