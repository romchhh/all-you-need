import { parseDbDate } from './parseDbDate';

/**
 * Форматує час відносно поточного моменту з перекладами
 */
export function formatTimeAgo(date: Date | string | null | undefined, t: (key: string, params?: Record<string, string>) => string): string {
  if (!date) {
    return '';
  }

  const now = new Date();
  const pastDate =
    date instanceof Date ? date : parseDbDate(date) ?? new Date(NaN);

  // Перевірка на валідність дати
  if (isNaN(pastDate.getTime())) {
    return '';
  }

  const diff = now.getTime() - pastDate.getTime();

  // Невелике від’ємне значення (різниця годинників) — показуємо «щойно»
  if (diff < 0) {
    return t('common.timeAgo.justNow');
  }
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) {
    return t('common.timeAgo.justNow');
  }
  
  if (minutes < 60) {
    return t('common.timeAgo.minutesAgo', { count: minutes.toString() });
  }
  
  if (hours < 24) {
    return t('common.timeAgo.hoursAgo', { count: hours.toString() });
  }
  
  if (days === 1) {
    return t('common.timeAgo.dayAgo');
  }
  
  if (days < 7) {
    return t('common.timeAgo.daysAgo', { count: days.toString() });
  }
  
  if (weeks === 1) {
    return t('common.timeAgo.weekAgo');
  }
  
  return t('common.timeAgo.weeksAgo', { count: weeks.toString() });
}

