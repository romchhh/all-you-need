'use client';

import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, savedScrollY);
  }
}

/** Blocks background scroll while a modal/overlay is open (ref-counted for nested modals). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);
}
