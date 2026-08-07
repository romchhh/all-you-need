import { TelegramWebApp } from '@/types/telegram';

/** Telegram ID для оплат — той самий джерело, що й у PaymentSummaryModal для балансу. */
export function resolvePaymentTelegramId(
  tg: TelegramWebApp | null | undefined,
  fallback?: string | number | null
): string | null {
  const fromTg = tg?.initDataUnsafe?.user?.id;
  if (fromTg != null && String(fromTg).trim()) {
    return String(fromTg);
  }

  if (fallback != null && String(fallback).trim()) {
    return String(fallback).trim();
  }

  if (typeof window !== 'undefined') {
    const fromSession = sessionStorage.getItem('telegramId');
    if (fromSession?.trim()) return fromSession.trim();

    const fromUrl = new URLSearchParams(window.location.search).get('telegramId');
    if (fromUrl?.trim()) return fromUrl.trim();
  }

  return null;
}
