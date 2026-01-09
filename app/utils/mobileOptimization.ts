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
    /* Оптимізація для мобільних пристроїв */
    * {
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    
    /* Використовуємо GPU прискорення для анімацій */
    [class*="transition"],
    [class*="animate"],
    img,
    button,
    .hover\\:scale-110 {
      will-change: transform;
      transform: translateZ(0);
      backface-visibility: hidden;
      perspective: 1000px;
    }
    
    /* Оптимізація скролу */
    body {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
    }
    
    /* Оптимізація зображень */
    img {
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    
    /* Вимкнення виділення тексту для кращої продуктивності на мобільних */
    button,
    [role="button"] {
      -webkit-user-select: none;
      user-select: none;
    }
    
    /* Оптимізація шрифтів */
    body {
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
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
