'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TradeGroundLogo } from '@/components/TradeGroundLogo';
import { useTheme } from '@/contexts/ThemeContext';

/** Висота рядка логотипу (узгоджено з TradeGroundLogo) + нижній відступ хедера */
const LOGO_ROW = '2.25rem';
const HEADER_BOTTOM_PAD = '0.625rem'; /* pb-2.5 */

export const AppHeader: React.FC = () => {
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';
  const { isLight } = useTheme();
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleClick = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${lang}/bazaar`;
    }
  }, [lang]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
      setScrollProgress(Math.min(1, y / 56));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const p = scrollProgress;
  const bg = isLight
    ? `rgba(255, 255, 255, ${p * 0.98 + (p > 0 ? 0.02 : 0)})`
    : `rgba(17, 20, 14, ${p * 0.97 + (p > 0 ? 0.03 : 0)})`;
  const blurPx = p < 0.08 ? 0 : Math.round(4 + p * 10);
  const borderAlpha = isLight ? p * 0.12 : p * 0.14;

  const spacerHeight = `calc(${LOGO_ROW} + ${HEADER_BOTTOM_PAD} + max(env(safe-area-inset-top, 0px), 10px))`;

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-[45] w-full max-w-full transition-[box-shadow] duration-200 ease-out"
        style={{
          backgroundColor: bg,
          backdropFilter: blurPx > 0 ? `saturate(160%) blur(${blurPx}px)` : 'none',
          WebkitBackdropFilter: blurPx > 0 ? `saturate(160%) blur(${blurPx}px)` : 'none',
          boxShadow: p > 0.15 ? `0 1px 0 0 rgba(0, 0, 0, ${borderAlpha})` : 'none',
        }}
      >
        <div className="mx-auto w-full max-w-2xl pb-2.5 pt-[max(env(safe-area-inset-top),10px)] lg:max-w-5xl xl:max-w-6xl">
          <TradeGroundLogo embedInFixedHeader onClick={handleClick} />
        </div>
      </header>
      <div className="w-full shrink-0" style={{ height: spacerHeight }} aria-hidden />
    </>
  );
};
