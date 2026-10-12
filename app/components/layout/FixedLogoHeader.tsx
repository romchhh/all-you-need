'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { TradeGroundLogo } from '@/components/layout/TradeGroundLogo';
import { useTheme } from '@/contexts/ThemeContext';

/** Коротке згасання біля нижнього краю спільної шапки. */
const FROST_FADE = '10px';
const FROST_MASK = `linear-gradient(to bottom, #000 0, #000 calc(100% - ${FROST_FADE}), transparent 100%)`;

let headerSlot: HTMLElement | null = null;
const slotListeners = new Set<() => void>();
let remeasureHeader: (() => void) | null = null;

function publishHeaderSlot(el: HTMLElement | null) {
  headerSlot = el;
  slotListeners.forEach((fn) => fn());
}

export function useHeaderSlotElement(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const sync = () => setEl(headerSlot);
    sync();
    slotListeners.add(sync);
    return () => {
      slotListeners.delete(sync);
    };
  }, []);
  return el;
}

export function remeasureAppHeader() {
  remeasureHeader?.();
}

/**
 * Висота блоку шапки = safe-top + внутрішній відступ (моб pt-9) + ряд лого + pb.
 * Дублюйте ці ж calc у STICKY_BELOW_APP_HEADER_CLASS, щоб sticky-панелі не заходили під лого.
 */
export const FIXED_LOGO_SPACER_CLASS =
  'w-full shrink-0 max-lg:h-[calc(max(env(safe-area-inset-top,0px),10px)+2.25rem+2.25rem+0.625rem)] lg:h-[calc(max(env(safe-area-inset-top,0px),2px)+0.5rem+2.25rem+0.625rem)]';

/** Sticky-елементи під фіксованим AppHeader (базар, категорії тощо) */
export const STICKY_BELOW_APP_HEADER_CLASS =
  'sticky z-[40] max-lg:top-[calc(max(env(safe-area-inset-top,0px),10px)+2.25rem+2.25rem+0.625rem)] lg:top-[calc(max(env(safe-area-inset-top,0px),2px)+0.5rem+2.25rem+0.625rem)]';

function headerFrostStyle(isLight: boolean): React.CSSProperties {
  const veil = isLight
    ? `linear-gradient(to bottom, rgba(250,251,248,0.9) 0, rgba(250,251,248,0.9) calc(100% - ${FROST_FADE}), rgba(250,251,248,0) 100%)`
    : `linear-gradient(to bottom, rgba(0,0,0,0.74) 0, rgba(0,0,0,0.74) calc(100% - ${FROST_FADE}), rgba(0,0,0,0) 100%)`;
  return {
    backgroundImage: isLight
      ? veil
      : `${veil}, radial-gradient(ellipse 70% 55% at 18% 0%, rgba(200,230,160,0.16) 0%, transparent 42%)`,
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
  /** Слот під рядком лого: пошук стає частиною цієї ж шапки. */
  extrasSlot?: boolean;
};

export function FixedLogoHeader({
  onClick,
  paddingX = true,
  outerClassName = '',
  zClassName = 'z-[45]',
  mode,
  extrasSlot = false,
}: FixedLogoHeaderProps) {
  const { isLight, theme } = useTheme();
  const headerRef = useRef<HTMLElement | null>(null);
  const [spacerPx, setSpacerPx] = useState<number | null>(null);
  const slotNodeRef = useRef<HTMLDivElement | null>(null);
  const setSlotNode = useCallback((node: HTMLDivElement | null) => {
    if (slotNodeRef.current === node) return;
    slotNodeRef.current = node;
    publishHeaderSlot(node);
  }, []);
  const innerClasses = `${innerContentClass} ${outerClassName}`.trim();
  const shellClass = `w-full max-w-full bg-transparent ${zClassName}`;

  useLayoutEffect(() => {
    if (mode !== 'window-fixed') return;
    const measure = () => {
      const el = headerRef.current;
      if (el) setSpacerPx(el.offsetHeight);
    };
    remeasureHeader = measure;
    measure();
    const el = headerRef.current;
    const ro = el ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    return () => {
      if (remeasureHeader === measure) remeasureHeader = null;
      ro?.disconnect();
    };
  }, [mode, isLight, extrasSlot]);

  const body = (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={headerFrostStyle(isLight)} />
      <div className="relative">
        <div className={safeTopShellClass}>
          <div className={innerClasses}>
            <TradeGroundLogo embedInFixedHeader onClick={onClick} paddingX={paddingX} />
          </div>
        </div>
        {extrasSlot ? (
          <div ref={setSlotNode} />
        ) : null}
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
      <header
        ref={headerRef}
        key={`tg-app-header-${theme}`}
        className={`fixed left-0 right-0 top-0 ${shellClass}`}
      >
        {body}
      </header>
      <div
        className={FIXED_LOGO_SPACER_CLASS}
        style={spacerPx != null ? { height: spacerPx } : undefined}
        aria-hidden
      />
    </>
  );
}
