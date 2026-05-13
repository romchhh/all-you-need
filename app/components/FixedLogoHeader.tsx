'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TradeGroundLogo } from '@/components/TradeGroundLogo';
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
  scrollParent,
}: FixedLogoHeaderProps) {
  const { isLight } = useTheme();
  const [scrollProgress, setScrollProgress] = useState(0);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const spacerBaselineRef = useRef<number | null>(null);

  useEffect(() => {
    const readYFromChain = () => {
      const root = typeof document !== 'undefined' ? document.scrollingElement ?? document.documentElement : null;
      const yDoc = root?.scrollTop ?? 0;
      const yWin = typeof window !== 'undefined' ? window.scrollY || window.pageYOffset || 0 : 0;
      const yHtml = typeof document !== 'undefined' ? document.documentElement.scrollTop || 0 : 0;
      const yBody = typeof document !== 'undefined' ? document.body.scrollTop || 0 : 0;
      return Math.max(yWin, yDoc, yHtml, yBody);
    };

    /** iOS / Telegram: зсув кореня документа */
    const readYFromHtmlShift = () => {
      if (typeof document === 'undefined') return 0;
      const top = document.documentElement.getBoundingClientRect().top;
      return Math.max(0, Math.round(-top));
    };

    /** Якщо scrollTop лишається 0, оцінюємо скрол по зміні top спейсера відносно бази */
    const readYFromSpacer = () => {
      const el = spacerRef.current;
      if (!el || spacerBaselineRef.current === null) return 0;
      const st = el.getBoundingClientRect().top;
      return Math.max(0, Math.round(spacerBaselineRef.current - st));
    };

    const readY = () => {
      if (mode === 'sticky' && scrollParent) {
        return scrollParent.scrollTop;
      }
      const chain = readYFromChain();
      const htmlShift = readYFromHtmlShift();
      const spacerY = readYFromSpacer();
      const y = Math.max(chain, htmlShift, spacerY);
      /* У «верху» сторінки підтягуємо базу, щоб не накопичувалась похибка */
      if (y < 2 && spacerRef.current) {
        spacerBaselineRef.current = spacerRef.current.getBoundingClientRect().top;
      }
      return y;
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = readY();
        setScrollProgress(Math.min(1, y / 32));
      });
    };

    const initBaseline = () => {
      if (spacerRef.current) {
        spacerBaselineRef.current = spacerRef.current.getBoundingClientRect().top;
      }
    };
    initBaseline();
    requestAnimationFrame(initBaseline);

    onScroll();

    if (mode === 'sticky') {
      if (!scrollParent) {
        return;
      }
      scrollParent.addEventListener('scroll', onScroll, { passive: true });
      return () => {
        scrollParent.removeEventListener('scroll', onScroll);
        if (raf) cancelAnimationFrame(raf);
      };
    }

    const root = typeof document !== 'undefined' ? document.scrollingElement ?? document.documentElement : null;
    const body = typeof document !== 'undefined' ? document.body : null;
    const targets: (Window | Document | HTMLElement)[] = [window, document, root, body].filter(
      (x): x is Window | Document | HTMLElement => x != null
    );
    targets.forEach((t) => t.addEventListener('scroll', onScroll, { passive: true, capture: true }));

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('scroll', onScroll);
    vv?.addEventListener('resize', onScroll);
    window.addEventListener('resize', initBaseline);

    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    tg?.onEvent?.('viewportChanged', onScroll);

    const poll = window.setInterval(onScroll, 120);

    return () => {
      targets.forEach((t) => t.removeEventListener('scroll', onScroll, true));
      vv?.removeEventListener('scroll', onScroll);
      vv?.removeEventListener('resize', onScroll);
      window.removeEventListener('resize', initBaseline);
      tg?.offEvent?.('viewportChanged', onScroll);
      window.clearInterval(poll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mode, scrollParent]);

  const p = scrollProgress;
  /* y=0 — прозоро; при скролі — суцільніший фон (без «невидимого» порогу) */
  const bgAlpha = p <= 0 ? 0 : 0.18 + p * 0.82;
  const bg = isLight ? `rgba(255, 255, 255, ${bgAlpha})` : `rgba(17, 20, 14, ${bgAlpha})`;
  const blurPx = p < 0.05 ? 0 : Math.round(4 + p * 12);
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
      <header
        className={`fixed left-0 right-0 top-0 ${zClassName} w-full max-w-full`}
        style={shellStyle}
      >
        <div className={safeTopShellClass}>
          <div className={innerClasses}>
            <TradeGroundLogo embedInFixedHeader onClick={onClick} paddingX={paddingX} />
          </div>
        </div>
      </header>
      <div ref={spacerRef} className={FIXED_LOGO_SPACER_CLASS} aria-hidden />
    </>
  );
}
