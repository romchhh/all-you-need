'use client';

import React from 'react';
import { TradeGroundLogo } from '@/components/layout/TradeGroundLogo';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Висота блоку шапки = safe-top + внутрішній відступ (моб pt-9) + ряд лого + pb.
 * Дублюйте ці ж calc у STICKY_BELOW_APP_HEADER_CLASS, щоб sticky-панелі не заходили під лого.
 */
export const FIXED_LOGO_SPACER_CLASS =
  'w-full shrink-0 max-lg:h-[calc(max(env(safe-area-inset-top,0px),10px)+2.25rem+2.25rem+0.625rem)] lg:h-[calc(max(env(safe-area-inset-top,0px),2px)+0.5rem+2.25rem+0.625rem)]';

/** Sticky-елементи під фіксованим AppHeader (базар, категорії тощо) */
export const STICKY_BELOW_APP_HEADER_CLASS =
  'sticky z-[40] max-lg:top-[calc(max(env(safe-area-inset-top,0px),10px)+2.25rem+2.25rem+0.625rem)] lg:top-[calc(max(env(safe-area-inset-top,0px),2px)+0.5rem+2.25rem+0.625rem)]';

const FROST_MASK =
  'linear-gradient(to bottom, #000 0%, #000 28%, rgba(0,0,0,0.55) 68%, transparent 100%)';

/** Підкладка рядка пошуку: блюр видно крізь саме поле, донизу згасає. */
export function stickyFrostedBarStyle(isLight: boolean): React.CSSProperties {
  return {
    backgroundColor: 'transparent',
    backgroundImage: isLight
      ? 'linear-gradient(to bottom, rgba(250,251,248,0.42) 0%, rgba(250,251,248,0.12) 62%, rgba(250,251,248,0) 100%)'
      : 'linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 62%, rgba(0,0,0,0) 100%)',
    backdropFilter: 'saturate(160%) blur(16px)',
    WebkitBackdropFilter: 'saturate(160%) blur(16px)',
  };
}

function headerFrostStyle(isLight: boolean): React.CSSProperties {
  return {
    backgroundImage: isLight
      ? 'linear-gradient(to bottom, rgba(250,251,248,0.92) 0%, rgba(245,247,242,0.4) 50%, rgba(250,251,248,0) 100%)'
      : 'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.32) 54%, rgba(0,0,0,0) 100%), radial-gradient(ellipse 80% 90% at 18% 0%, rgba(200,230,160,0.2) 0%, transparent 52%)',
    backdropFilter: 'saturate(160%) blur(16px)',
    WebkitBackdropFilter: 'saturate(160%) blur(16px)',
    maskImage: FROST_MASK,
    WebkitMaskImage: FROST_MASK,
  };
}

/** Фіксована кнопка «Назад» під лого в оверлеях (ListingDetail, профіль продавця). */
export const OVERLAY_BACK_BUTTON_TOP_CLASS =
  'max-lg:top-[calc(max(env(safe-area-inset-top,0px),10px)+2.25rem+2.25rem+0.625rem+1.25rem)] lg:top-[calc(max(env(safe-area-inset-top,0px),2px)+0.5rem+2.25rem+0.625rem+1.25rem)]';

/** Напівпрозорий стиль круглої кнопки «Назад» (як на сторінці товару). */
export const overlayHeaderActionClass = (isLight: boolean) =>
  isLight
    ? 'border-[#3F5331]/20 bg-white/95 text-[#3F5331] shadow-sm hover:bg-[#E8F0E0]/80'
    : 'border-white/25 bg-black/45 text-white backdrop-blur-md hover:bg-black/60';

/** Safe area окремо — щоб не покладатися на вкладений max() у calc() у arbitrary-класах */
const safeTopShellClass =
  'max-lg:pt-[max(env(safe-area-inset-top,0px),10px)] lg:pt-[max(env(safe-area-inset-top,0px),2px)]';

const innerContentClass =
  'mx-auto w-full max-w-2xl pb-2.5 max-lg:pt-9 lg:pt-2 lg:max-w-5xl xl:max-w-6xl';

export type FixedLogoHeaderMode = 'window-fixed' | 'sticky';

export type FixedLogoHeaderProps = {
  onClick?: () => void;
  paddingX?: boolean;
  outerClassName?: string;
  zClassName?: string;
  mode: FixedLogoHeaderMode;
  scrollParent?: HTMLElement | null;
};

export function FixedLogoHeader({
  onClick,
  paddingX = true,
  outerClassName = '',
  zClassName = 'z-[45]',
  mode,
}: FixedLogoHeaderProps) {
  const { isLight, theme } = useTheme();
  const innerClasses = `${innerContentClass} ${outerClassName}`.trim();
  const shellClass = `w-full max-w-full bg-transparent ${zClassName}`;

  const body = (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={headerFrostStyle(isLight)} />
      <div className={`relative ${safeTopShellClass}`}>
        <div className={innerClasses}>
          <TradeGroundLogo embedInFixedHeader onClick={onClick} paddingX={paddingX} />
        </div>
      </div>
    </>
  );

  if (mode === 'sticky') {
    return (
      <div key={`tg-app-header-${theme}`} className={`sticky top-0 ${shellClass}`}>
        {body}
      </div>
    );
  }

  return (
    <>
      <header key={`tg-app-header-${theme}`} className={`fixed left-0 right-0 top-0 ${shellClass}`}>
        {body}
      </header>
      <div className={FIXED_LOGO_SPACER_CLASS} aria-hidden />
    </>
  );
}
