import type { TelegramWebApp } from '@/types/telegram';
import { openTelegramDeepLink, openTelegramUrlWithPrefill } from '@/utils/sellerContact';

/** Публічний @username з t.me/name (не invite + / joinchat). */
export function extractPublicTelegramUsername(inviteLink: string | null | undefined): string | null {
  const raw = (inviteLink || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw.replace(/^\/+/, '')}`);
    if (!/^(?:www\.)?(?:t\.me|telegram\.me)$/i.test(url.hostname)) return null;
    const part = url.pathname.replace(/^\/+/, '').split('/')[0] || '';
    if (!part || part.startsWith('+') || /^joinchat$/i.test(part) || /^c$/i.test(part)) {
      return null;
    }
    if (!/^[a-zA-Z][\w\d_]{3,31}$/.test(part)) return null;
    return part;
  } catch {
    return null;
  }
}

/**
 * Відкрити групу для публікації.
 * Публічний username → чат із готовим текстом (як шаблони продавцю).
 * Інакше — invite + викликач має попередньо скопіювати текст.
 */
export function openShareGroupChat(
  inviteLink: string,
  chatText: string,
  tg?: TelegramWebApp | null
): { mode: 'prefill' | 'invite' } {
  const username = extractPublicTelegramUsername(inviteLink);
  if (username && chatText.trim()) {
    openTelegramUrlWithPrefill(
      `https://t.me/${username}?text=${encodeURIComponent(chatText.trim())}`,
      tg || undefined
    );
    return { mode: 'prefill' };
  }
  openTelegramDeepLink(inviteLink, tg || undefined);
  return { mode: 'invite' };
}

export function canUseShareMessage(tg?: TelegramWebApp | null): boolean {
  return Boolean(tg?.shareMessage && typeof tg.shareMessage === 'function');
}
