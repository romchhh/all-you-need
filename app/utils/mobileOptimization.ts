/**
 * Утиліти для оптимізації мобільної продуктивності
 */

/**
 * Додає CSS оптимізації для мобільних пристроїв
 */
export function addMobileOptimizations(): void {
  if (typeof window === 'undefined') return;

  // Додаємо стилі для оптимізації анімацій
  const style = document.createElement('style');
  style.textContent = `
    /* Оптимізація для мobile */
    * {
      -webkit-tap-highlight-color: transparent;
    }
    
    /* GPU для зображень — без transform на контейнерах (ламає position: fixed) */
    img {
      image-rendering: -webkit-optimize-contrast;
    }
    
    body {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    button,
    [role="button"] {
      -webkit-user-select: none;
      user-select: none;
    }

    [data-bottom-nav] {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 1000 !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Оптимізує продуктивність при скролі
 */
export function optimizeScrollPerformance(): (() => void) | void {
  if (typeof window === 'undefined') return;

  let ticking = false;

  const handleScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        // Scroll handling logic
        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  
  return () => {
    window.removeEventListener('scroll', handleScroll);
  };
}

/**
 * Оптимізує продуктивність при touch events
 */
export function optimizeTouchPerformance(): void {
  if (typeof window === 'undefined') return;

  // Використовуємо passive listeners для кращої продуктивності
  const touchOptions = { passive: true };

  // Додаємо touch-action для оптимізації
  document.body.style.touchAction = 'pan-y';
}

/**
 * Ініціалізує всі мобільні оптимізації
 */
export function initMobileOptimizations(): void {
  if (typeof window === 'undefined') return;

  addMobileOptimizations();
  optimizeScrollPerformance();
  optimizeTouchPerformance();
}
