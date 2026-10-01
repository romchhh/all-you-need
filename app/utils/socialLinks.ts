import type { TelegramWebApp } from '@/types/telegram';

/** Нормалізує Instagram до https://instagram.com/{handle} */
export function normalizeInstagramUrl(raw: string | null | undefined): string | null {
  const s = (raw || '').trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./i, '');
      if (host === 'instagram.com' || host === 'm.instagram.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        const handle = parts[0];
        if (handle && !['p', 'reel', 'reels', 'stories'].includes(handle.toLowerCase())) {
          return `https://www.instagram.com/${handle}/`;
        }
        if (parts.length >= 2 && (parts[0] === 'p' || parts[0] === 'reel')) {
          return u.toString();
        }
      }
    } catch {
      // fall through
    }
  }

  let handle = s.replace(/^@/, '').trim();
  handle = handle.replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '');
  handle = handle.split(/[/?#]/)[0]?.trim() || '';
  if (!handle) return null;
  return `https://www.instagram.com/${handle}/`;
}

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/\//, '')}`;
}

/** Зберігаємо в БД компактно: для Instagram — @handle або URL поста. */
export function normalizeInstagramForStorage(raw: string | null | undefined): string | null {
  const url = normalizeInstagramUrl(raw);
  if (!url) return (raw || '').trim() || null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] && !['p', 'reel', 'reels'].includes(parts[0].toLowerCase())) {
      return `@${parts[0]}`;
    }
  } catch {
    // keep url
  }
  return url;
}

export function normalizeWebsiteForStorage(raw: string | null | undefined): string | null {
  const url = normalizeWebsiteUrl(raw);
  return url || ((raw || '').trim() || null);
}

export function openExternalUrl(url: string, tg?: TelegramWebApp | null): void {
  const target = url.trim();
  if (!target) return;
  if (tg?.openLink) {
    tg.openLink(target);
    tg.HapticFeedback?.impactOccurred('light');
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
}
