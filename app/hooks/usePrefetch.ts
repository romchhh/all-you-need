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
    // Prefetch популярні сторінки на основі поточної
    if (currentPath.includes('/bazaar')) {
      prefetchPages(['/uk/categories', '/uk/favorites', '/uk/profile']);
    } else if (currentPath.includes('/categories')) {
      prefetchPages(['/uk/bazaar', '/uk/favorites', '/uk/profile']);
    } else if (currentPath.includes('/favorites')) {
      prefetchPages(['/uk/bazaar', '/uk/categories', '/uk/profile']);
    } else if (currentPath.includes('/profile')) {
      prefetchPages(['/uk/bazaar', '/uk/categories', '/uk/favorites']);
    }
  }, [currentPath, prefetchPages]);
}
