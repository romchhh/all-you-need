'use client';

import { useEffect } from 'react';

let hideBottomNavCount = 0;

function syncHideBottomNavAttribute() {
  if (typeof document === 'undefined') return;
  if (hideBottomNavCount > 0) {
    document.body.setAttribute('data-hide-bottom-nav', 'true');
  } else {
    document.body.removeAttribute('data-hide-bottom-nav');
  }
}

/** Ховає нижнє меню, поки відкритий повноекранний overlay (створення/редагування оголошення). */
export function useHideBottomNav(active: boolean) {
  useEffect(() => {
    if (!active) return;

    hideBottomNavCount += 1;
    syncHideBottomNavAttribute();

    return () => {
      hideBottomNavCount = Math.max(0, hideBottomNavCount - 1);
      syncHideBottomNavAttribute();
    };
  }, [active]);
}
