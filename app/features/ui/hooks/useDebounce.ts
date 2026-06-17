import { useState, useEffect } from 'react';

/**
 * Хук для debounce значення
 * @param value - значення для debounce
 * @param delay - затримка в мілісекундах (за замовчуванням 300ms)
 * @returns debounced значення
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Встановлюємо таймер для оновлення debounced значення
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Очищаємо таймер якщо value змінився або компонент розмонтується
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
