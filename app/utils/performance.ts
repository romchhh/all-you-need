/**
 * Утиліти для моніторингу продуктивності
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100;

  /**
   * Вимірює час виконання функції
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration);
      throw error;
    }
  }

  /**
   * Записує метрику
   */
  recordMetric(name: string, value: number): void {
    if (process.env.NODE_ENV !== 'development') return;

    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
    });

    // Обмежуємо кількість метрик
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Логуємо повільні операції
    if (value > 1000) {
      console.warn(`[Performance] Slow operation: ${name} took ${value.toFixed(2)}ms`);
    }
  }

  /**
   * Отримує всі метрики
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Очищає метрики
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Отримує середнє значення для метрики
   */
  getAverage(name: string): number {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) return 0;
    const sum = filtered.reduce((acc, m) => acc + m.value, 0);
    return sum / filtered.length;
  }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Вимірює Web Vitals
 */
export function measureWebVitals(): void {
  if (typeof window === 'undefined') return;

  // Largest Contentful Paint (LCP)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        if (lastEntry) {
          performanceMonitor.recordMetric('LCP', lastEntry.renderTime || lastEntry.loadTime);
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // Not supported
    }

    // First Input Delay (FID)
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          performanceMonitor.recordMetric('FID', entry.processingStart - entry.startTime);
        });
      });
      observer.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // Not supported
    }

    // Cumulative Layout Shift (CLS)
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        entries.forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        performanceMonitor.recordMetric('CLS', clsValue);
      });
      observer.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      // Not supported
    }
  }
}

// Автоматично вимірюємо Web Vitals при завантаженні
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    measureWebVitals();
  } else {
    window.addEventListener('load', measureWebVitals);
  }
}
