/**
 * Форматує час відносно поточного моменту з перекладами
 */
export function formatTimeAgo(date: Date | string | null | undefined, t: (key: string, params?: Record<string, string>) => string): string {
  if (!date) {
    return '';
  }
  
  const now = new Date();
  const pastDate = typeof date === 'string' ? new Date(date) : date;
  
  // Перевірка на валідність дати
  if (isNaN(pastDate.getTime())) {
    return '';
  }
  
  const diff = now.getTime() - pastDate.getTime();
  
  // Якщо дата в майбутньому, повертаємо порожній рядок
  if (diff < 0) {
    return '';
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

