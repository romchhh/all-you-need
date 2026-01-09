/**
 * Утиліта для відстеження помилок
 */

interface ErrorInfo {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

class ErrorTracker {
  private errors: ErrorInfo[] = [];
  private maxErrors = 50;

  /**
   * Відстежує помилку
   */
  trackError(error: Error, componentStack?: string): void {
    const errorInfo: ErrorInfo = {
      message: error.message,
      stack: error.stack,
      componentStack,
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };

    this.errors.push(errorInfo);

    // Обмежуємо кількість помилок
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Логуємо помилку
    console.error('[ErrorTracker]', errorInfo);

    // В production можна відправляти на сервер або в Sentry
    if (process.env.NODE_ENV === 'production') {
      // TODO: Інтегрувати з Sentry або іншим сервісом
      // this.sendToServer(errorInfo);
    }
  }

  /**
   * Отримує всі помилки
   */
  getErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  /**
   * Очищає помилки
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Відправляє помилку на сервер (для майбутньої реалізації)
   */
  private async sendToServer(errorInfo: ErrorInfo): Promise<void> {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorInfo),
      });
    } catch (e) {
      // Ігноруємо помилки відправки
    }
  }
}

export const errorTracker = new ErrorTracker();

/**
 * Ініціалізує глобальне відстеження помилок
 */
export function initErrorTracking(): void {
  if (typeof window === 'undefined') return;

  // Відстежуємо необроблені помилки
  window.addEventListener('error', (event) => {
    errorTracker.trackError(
      new Error(event.message),
      event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : undefined
    );
  });

  // Відстежуємо необроблені проміси
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    errorTracker.trackError(error);
  });
}

// Автоматично ініціалізуємо при завантаженні
if (typeof window !== 'undefined') {
  initErrorTracking();
}
