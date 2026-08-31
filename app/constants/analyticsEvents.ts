export const ANALYTICS_EVENT_GROUPS = {
  navigation: 'navigation',
  engagement: 'engagement',
  monetization: 'monetization',
  search: 'search',
  listing: 'listing',
} as const;

export type AnalyticsEventGroup =
  (typeof ANALYTICS_EVENT_GROUPS)[keyof typeof ANALYTICS_EVENT_GROUPS];

export const ANALYTICS_EVENTS = {
  categoryClick: 'category_click',
  subcategoryClick: 'subcategory_click',
  listingView: 'listing_view',
  contactSeller: 'contact_seller',
  favoriteAdd: 'favorite_add',
  favoriteRemove: 'favorite_remove',
  searchSubmit: 'search_submit',
  shareListing: 'share_listing',
  createListingStart: 'create_listing_start',
  createListingSubmit: 'create_listing_submit',
  promotionView: 'promotion_view',
  promotionSelect: 'promotion_select',
  navTabClick: 'nav_tab_click',
  citySelect: 'city_select',
  onboardingAction: 'onboarding_action',
  profileView: 'profile_view',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsTrackingConfig = {
  enabled: boolean;
  trackCategoryClicks: boolean;
  trackContactSeller: boolean;
  trackSearch: boolean;
  trackFavorites: boolean;
  trackListingViews: boolean;
  trackCreateListing: boolean;
  trackShare: boolean;
  trackNavigation: boolean;
  trackPromotions: boolean;
};

export const DEFAULT_ANALYTICS_TRACKING_CONFIG: AnalyticsTrackingConfig = {
  enabled: true,
  trackCategoryClicks: true,
  trackContactSeller: true,
  trackSearch: true,
  trackFavorites: true,
  trackListingViews: true,
  trackCreateListing: true,
  trackShare: true,
  trackNavigation: true,
  trackPromotions: true,
};

export const ANALYTICS_EVENT_CONFIG_MAP: Record<
  AnalyticsEventName,
  keyof AnalyticsTrackingConfig | null
> = {
  [ANALYTICS_EVENTS.categoryClick]: 'trackCategoryClicks',
  [ANALYTICS_EVENTS.subcategoryClick]: 'trackCategoryClicks',
  [ANALYTICS_EVENTS.listingView]: 'trackListingViews',
  [ANALYTICS_EVENTS.contactSeller]: 'trackContactSeller',
  [ANALYTICS_EVENTS.favoriteAdd]: 'trackFavorites',
  [ANALYTICS_EVENTS.favoriteRemove]: 'trackFavorites',
  [ANALYTICS_EVENTS.searchSubmit]: 'trackSearch',
  [ANALYTICS_EVENTS.shareListing]: 'trackShare',
  [ANALYTICS_EVENTS.createListingStart]: 'trackCreateListing',
  [ANALYTICS_EVENTS.createListingSubmit]: 'trackCreateListing',
  [ANALYTICS_EVENTS.promotionView]: 'trackPromotions',
  [ANALYTICS_EVENTS.promotionSelect]: 'trackPromotions',
  [ANALYTICS_EVENTS.navTabClick]: 'trackNavigation',
  [ANALYTICS_EVENTS.citySelect]: 'trackNavigation',
  [ANALYTICS_EVENTS.onboardingAction]: 'trackNavigation',
  [ANALYTICS_EVENTS.profileView]: 'trackNavigation',
};
