'use client';

import { useLayoutEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

function readScrollY(): number {
  return (
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function restoreScrollY(targetY: number): void {
  const y = Math.max(0, Math.round(targetY));
  const html = document.documentElement;
  const prevHtmlBehavior = html.style.scrollBehavior;
  const prevBodyBehavior = document.body.style.scrollBehavior;

  html.style.scrollBehavior = 'auto';
  document.body.style.scrollBehavior = 'auto';

  window.scrollTo(0, y);
  html.scrollTop = y;
  document.body.scrollTop = y;

  html.style.scrollBehavior = prevHtmlBehavior;
  document.body.style.scrollBehavior = prevBodyBehavior;
}

function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    savedScrollY = readScrollY();
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0) return;

  const topStyle = document.body.style.top;
  const parsedTop = topStyle ? Math.abs(parseInt(topStyle, 10)) : Number.NaN;
  const scrollY =
    Number.isFinite(parsedTop) && parsedTop > 0 ? parsedTop : savedScrollY;

  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.documentElement.style.overflow = '';

  restoreScrollY(scrollY);

  // WebKit / Telegram WebView: якщо позиція не застосувалась — один кадр без smooth
  if (Math.abs(readScrollY() - scrollY) > 2) {
    requestAnimationFrame(() => {
      if (Math.abs(readScrollY() - scrollY) > 2) {
        restoreScrollY(scrollY);
      }
    });
  }
}

/** Blocks background scroll while a modal/overlay is open (ref-counted for nested modals). */
export function useBodyScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);
}
