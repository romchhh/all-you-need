export type DistributeResumeState = {
  listingId: number;
  step: 1 | 2;
  chatText: string;
  groupsTab: 'recommended' | 'mine';
  cityFilter: string;
  categoryFilter: string;
};

const KEY = 'ayn:distribute-resume';

export function saveDistributeResume(state: DistributeResumeState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function peekDistributeResume(listingId?: number): DistributeResumeState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DistributeResumeState;
    if (!parsed?.listingId) return null;
    if (listingId != null && parsed.listingId !== listingId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDistributeResume(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function consumeDistributeResume(listingId?: number): DistributeResumeState | null {
  const state = peekDistributeResume(listingId);
  if (state) clearDistributeResume();
  return state;
}
