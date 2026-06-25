import { useEffect } from 'react';

/** Скидає scroll документа при відкритті окремої сторінки (FAQ, політика тощо). */
export function useScrollToTopOnMount() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollToTop();
    requestAnimationFrame(scrollToTop);
  }, []);
}
