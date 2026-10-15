'use client';

import React, { useCallback, useMemo } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { FixedLogoHeader } from '@/components/layout/FixedLogoHeader';
import { dispatchBazaarRestoreListingScroll } from '@/lib/bazaar/bazaarScrollStorage';

/** Спільна шапка з пошуком — лише головна (базар) і екран пошуку. */
function pathUsesSearchInHeader(pathname: string | null, lang: string): boolean {
  if (!pathname) return false;
  const base = `/${lang}`;
  return (
    pathname === `${base}/bazaar` ||
    pathname.startsWith(`${base}/bazaar/`) ||
    pathname === `${base}/search` ||
    pathname.startsWith(`${base}/search/`)
  );
}

export const AppHeader: React.FC = () => {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  const extrasSlot = useMemo(
    () => pathUsesSearchInHeader(pathname, lang),
    [pathname, lang]
  );

  const handleClick = useCallback(() => {
    router.push(`/${lang}/bazaar`);
    dispatchBazaarRestoreListingScroll();
  }, [lang, router]);

  return (
    <FixedLogoHeader
      mode="window-fixed"
      extrasSlot={extrasSlot}
      onClick={handleClick}
    />
  );
};
