/** Telegram ID для персоналізації каталогу (профіль → WebApp → sessionStorage). */
export function resolveViewerTelegramId(
  profileTelegramId?: string | number | null,
  webAppUserId?: number | null
): string | null {
  if (profileTelegramId != null && String(profileTelegramId).trim()) {
    return String(profileTelegramId).trim();
  }
  if (webAppUserId != null && Number.isFinite(webAppUserId)) {
    return String(webAppUserId);
  }
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('telegramId')?.trim();
    if (stored) return stored;
  }
  return null;
}
