export const BUSINESS_PLANS = {
  business: {
    id: 'business' as const,
    price: 9.9,
    labelKey: 'businessProfile.plans.business.name',
    featuresKey: 'businessProfile.plans.business.features',
  },
  business_pro: {
    id: 'business_pro' as const,
    price: 19.9,
    labelKey: 'businessProfile.plans.businessPro.name',
    featuresKey: 'businessProfile.plans.businessPro.features',
  },
} as const;

export type BusinessPlanId = keyof typeof BUSINESS_PLANS;

export const SERVICE_AREA_OPTIONS = ['city_only', 'city_radius', 'all_germany'] as const;
export type ServiceArea = (typeof SERVICE_AREA_OPTIONS)[number];

export function isValidBusinessPlan(plan: string): plan is BusinessPlanId {
  return plan in BUSINESS_PLANS;
}

export function isValidServiceArea(area: string): area is ServiceArea {
  return (SERVICE_AREA_OPTIONS as readonly string[]).includes(area);
}

export const BUSINESS_SUBSCRIPTION_DAYS = 30;

/** Щомісячні кредити просування (не переносяться на наступний місяць). */
export const BUSINESS_PLAN_MONTHLY_CREDITS: Record<
  BusinessPlanId,
  { highlight: number; top: number }
> = {
  business: { highlight: 2, top: 0 },
  business_pro: { highlight: 5, top: 2 },
};

export type BusinessProfileStatsPayload = {
  followersCount: number;
  profileViews: number;
  listingViews: number;
  contactClicks: number;
  activeListings: number;
  totalListings: number;
  pendingListings: number;
  inactiveListings: number;
  favoritesTotal: number;
};

export const EMPTY_BUSINESS_PROFILE_STATS: BusinessProfileStatsPayload = {
  followersCount: 0,
  profileViews: 0,
  listingViews: 0,
  contactClicks: 0,
  activeListings: 0,
  totalListings: 0,
  pendingListings: 0,
  inactiveListings: 0,
  favoritesTotal: 0,
};
