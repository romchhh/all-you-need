/**
 * Часовий пояс Берліна
 */
const BERLIN_TIMEZONE = 'Europe/Berlin';

/**
 * Отримує поточну дату і час в часовому поясі Берліна
 */
export function nowBerlin(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: BERLIN_TIMEZONE }));
}

/**
 * Конвертує дату в часовий пояс Берліна
 */
export function toBerlinTime(date: Date): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: BERLIN_TIMEZONE }));
}

/**
 * Форматує дату в ISO формат для SQLite (в UTC для сумісності з datetime('now'))
 */
export function toSQLiteDate(date: Date): string {
  // Використовуємо UTC для сумісності з SQLite datetime('now')
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Отримує поточну дату в форматі SQLite (в UTC для сумісності з datetime('now'))
 */
export function nowSQLite(): string {
  return toSQLiteDate(new Date());
}

/**
 * Додає дні до дати (в UTC для сумісності з SQLite)
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Форматує дату для відображення (в часовому поясі Берліна)
 */
export function formatDate(date: Date | string, locale: string = 'uk-UA'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const berlinDate = toBerlinTime(dateObj);
  
  return berlinDate.toLocaleDateString(locale, {
    timeZone: BERLIN_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Форматує дату і час для відображення (в часовому поясі Берліна)
 */
export function formatDateTime(date: Date | string, locale: string = 'uk-UA'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const berlinDate = toBerlinTime(dateObj);
  
  return berlinDate.toLocaleString(locale, {
    timeZone: BERLIN_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Обчислює кількість днів між двома датами
 */
export function daysBetween(date1: Date, date2: Date): number {
  return Math.ceil((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
}
