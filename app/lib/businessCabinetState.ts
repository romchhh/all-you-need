export type BusinessCabinetState = 'active' | 'suspended' | 'draft' | 'inactive';

export function isBusinessProfileActive(profile: {
  subscriptionStatus: string;
  subscriptionEndsAt?: Date | string | null;
}): boolean {
  if (profile.subscriptionStatus !== 'active') return false;
  if (!profile.subscriptionEndsAt) return true;
  const ends =
    profile.subscriptionEndsAt instanceof Date
      ? profile.subscriptionEndsAt
      : new Date(profile.subscriptionEndsAt);
  if (Number.isNaN(ends.getTime())) return true;
  return ends > new Date();
}

/** Публічний Business (пошук, вітрина, SellerProfileRouter). */
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
}): boolean {
  return isBusinessProfileActive(profile) && isPublishedFlag(profile.isPublished);
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
  if (profile.subscriptionStatus === 'expired' && plan === 'business_pro') {
    return 'suspended';
  }

  if (profile.subscriptionStatus === 'draft' || !(profile.businessName || '').trim()) {
    return 'draft';
  }

  return 'inactive';
}
