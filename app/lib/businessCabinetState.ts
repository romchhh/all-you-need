export type BusinessCabinetState = 'active' | 'suspended' | 'draft' | 'inactive';

function subscriptionEndDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const ends = value instanceof Date ? value : new Date(value);
  return Number.isNaN(ends.getTime()) ? null : ends;
}

/** Платний PRO ще в межах оплаченого періоду (аналітика, кредити). */
export function isProPeriodCurrent(profile: {
  plan?: string | null;
  subscriptionStatus: string;
  subscriptionEndsAt?: Date | string | null;
}): boolean {
  if ((profile.plan || '').toLowerCase() !== 'business_pro') return false;
  if (profile.subscriptionStatus !== 'active') return false;
  const ends = subscriptionEndDate(profile.subscriptionEndsAt);
  if (!ends) return true;
  return ends > new Date();
}

/**
 * Кабінет Business доступний на безкоштовному тарифі і після кінця PRO.
 * Чернетка без публікації — ні.
 */
export function isBusinessProfileActive(profile: {
  subscriptionStatus: string;
  subscriptionEndsAt?: Date | string | null;
  plan?: string | null;
}): boolean {
  if (profile.subscriptionStatus === 'draft') return false;
  return profile.subscriptionStatus === 'active' || profile.subscriptionStatus === 'expired';
}

/** Публічний Business: опублікований профіль. Кінець PRO його не ховає. */
export function isPublishedFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === '1';
  }
  return false;
}

export function isBusinessProfilePubliclyVisible(profile: {
  subscriptionStatus: string;
  subscriptionEndsAt?: Date | string | null;
  isPublished: unknown;
  plan?: string | null;
}): boolean {
  if (profile.subscriptionStatus === 'draft') return false;
  return isPublishedFlag(profile.isPublished);
}

/** UI / API: стан Business-кабінету власника. */
export function resolveBusinessCabinetState(profile: {
  subscriptionStatus: string;
  subscriptionEndsAt?: Date | string | null;
  plan?: string | null;
  businessName?: string | null;
}): BusinessCabinetState {
  if (isBusinessProfileActive(profile)) return 'active';

  const plan = (profile.plan || 'business').toLowerCase();
  if (profile.subscriptionStatus === 'expired' && plan === 'business_pro' && !profile.businessName?.trim()) {
    return 'suspended';
  }

  if (profile.subscriptionStatus === 'draft' || !(profile.businessName || '').trim()) {
    return 'draft';
  }

  return 'inactive';
}
