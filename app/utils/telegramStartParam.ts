/**
 * Deep-link з t.me/Bot?startapp=… → Telegram.WebApp.initDataUnsafe.start_param
 * (іноді також tgWebAppStartParam у query).
 */

export function readTelegramStartParam(): string | null {
  if (typeof window === 'undefined') return null;

  const fromTg = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (typeof fromTg === 'string' && fromTg.trim()) {
    return fromTg.trim();
  }

  try {
    const sp = new URLSearchParams(window.location.search);
    const fromQuery =
      sp.get('tgWebAppStartParam') ||
      sp.get('startapp') ||
      sp.get('start_param');
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  } catch {
    /* ignore */
  }

  return null;
}

export type StartParamAction =
  | { type: 'listing'; id: number }
  | { type: 'business' }
  | { type: 'create' }
  | { type: 'unknown'; raw: string };

export function parseStartParam(raw: string | null | undefined): StartParamAction | null {
  const sp = (raw || '').trim();
  if (!sp) return null;
  const listing = sp.match(/^listing_(\d+)$/i);
  if (listing) return { type: 'listing', id: Number(listing[1]) };
  if (sp.toLowerCase() === 'business') return { type: 'business' };
  if (sp.toLowerCase() === 'create') return { type: 'create' };
  return { type: 'unknown', raw: sp };
}

/** sessionStorage keys для ProfileTab / CreateListing */
export const OPEN_BUSINESS_FLOW_KEY = 'openBusinessFlow';
export const OPEN_CREATE_LISTING_KEY = 'openCreateListing';
export const START_PARAM_APPLIED_KEY = 'tgStartParamApplied';
