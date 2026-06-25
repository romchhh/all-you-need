import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Хук для prefetching наступних сторінок
 * Використовується для покращення UX при навігації
 */
export function usePrefetch() {
  const router = useRouter();

  /**
   * Prefetch сторінку
   */
  const prefetchPage = (path: string) => {
    if (typeof window !== 'undefined') {
      router.prefetch(path);
    }
  };

  /**
   * Prefetch декілька сторінок одночасно
   */
  const prefetchPages = (paths: string[]) => {
    if (typeof window !== 'undefined') {
      paths.forEach(path => {
        router.prefetch(path);
      });
    }
  };

  return { prefetchPage, prefetchPages };
}

/**
 * Хук для автоматичного prefetching на основі поточної сторінки
 */
export function useAutoPrefetch(currentPath: string) {
  const { prefetchPages } = usePrefetch();

  useEffect(() => {
    const runPrefetch = () => {
      const langMatch = currentPath.match(/^\/(uk|ru)/);
      const lang = langMatch?.[1] ?? 'uk';
      const tabs = ['bazaar', 'categories', 'favorites', 'profile'] as const;
      const current = tabs.find((tab) => currentPath.includes(`/${tab}`));
      const toPrefetch = tabs
        .filter((tab) => tab !== current)
        .map((tab) => `/${lang}/${tab}`);
      prefetchPages(toPrefetch);
    };

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(runPrefetch, { timeout: 5000 });
    } else {
      timeoutId = setTimeout(runPrefetch, 4000);
    }

    return () => {
      if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentPath, prefetchPages]);
}
