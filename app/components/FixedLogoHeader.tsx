'use client';

import React, { useEffect, useState } from 'react';
import { TradeGroundLogo } from '@/components/TradeGroundLogo';
import { useTheme } from '@/contexts/ThemeContext';

/** Висота фіксованого блоку = safe-top + дод. відступ (моб pt-7) + ряд лого + pb */
export const FIXED_LOGO_SPACER_CLASS =
  'w-full shrink-0 max-lg:h-[calc(max(env(safe-area-inset-top,0px),10px)+1.75rem+2.25rem+0.625rem)] lg:h-[calc(max(env(safe-area-inset-top,0px),2px)+0.5rem+2.25rem+0.625rem)]';

/** Safe area окремо — щоб не покладатися на вкладений max() у calc() у arbitrary-класах */
const safeTopShellClass =
  'max-lg:pt-[max(env(safe-area-inset-top,0px),10px)] lg:pt-[max(env(safe-area-inset-top,0px),2px)]';

const innerContentClass =
  'mx-auto w-full max-w-2xl pb-2.5 max-lg:pt-7 lg:pt-2 lg:max-w-5xl xl:max-w-6xl';

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
  scrollParent,
}: FixedLogoHeaderProps) {
  const { isLight } = useTheme();
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const readY = () => {
      if (mode === 'sticky' && scrollParent) {
        return scrollParent.scrollTop;
      }
      return window.scrollY ?? document.documentElement.scrollTop ?? 0;
    };

    const onScroll = () => {
      const y = readY();
      setScrollProgress(Math.min(1, y / 56));
    };

    onScroll();

    if (mode === 'sticky') {
      if (!scrollParent) {
        return;
      }
      scrollParent.addEventListener('scroll', onScroll, { passive: true });
      return () => scrollParent.removeEventListener('scroll', onScroll);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mode, scrollParent]);

  const p = scrollProgress;
  const bg = isLight
    ? `rgba(255, 255, 255, ${p * 0.98 + (p > 0 ? 0.02 : 0)})`
    : `rgba(17, 20, 14, ${p * 0.97 + (p > 0 ? 0.03 : 0)})`;
  const blurPx = p < 0.08 ? 0 : Math.round(4 + p * 10);
  const borderAlpha = isLight ? p * 0.12 : p * 0.14;

  const shellStyle: React.CSSProperties = {
    backgroundColor: bg,
    backdropFilter: blurPx > 0 ? `saturate(160%) blur(${blurPx}px)` : 'none',
    WebkitBackdropFilter: blurPx > 0 ? `saturate(160%) blur(${blurPx}px)` : 'none',
    boxShadow: p > 0.15 ? `0 1px 0 0 rgba(0, 0, 0, ${borderAlpha})` : 'none',
    transition: 'box-shadow 0.2s ease-out, background-color 0.2s ease-out',
  };

  const innerClasses = `${innerContentClass} ${outerClassName}`.trim();

  if (mode === 'sticky') {
    return (
      <div className={`sticky top-0 ${zClassName} w-full max-w-full`} style={shellStyle}>
        <div className={safeTopShellClass}>
          <div className={innerClasses}>
            <TradeGroundLogo embedInFixedHeader onClick={onClick} paddingX={paddingX} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className={`fixed left-0 right-0 top-0 ${zClassName} w-full max-w-full`} style={shellStyle}>
        <div className={safeTopShellClass}>
          <div className={innerClasses}>
            <TradeGroundLogo embedInFixedHeader onClick={onClick} paddingX={paddingX} />
          </div>
        </div>
      </header>
      <div className={FIXED_LOGO_SPACER_CLASS} aria-hidden />
    </>
  );
}
