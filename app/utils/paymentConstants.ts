// Client-safe payment constants (no server dependencies)

export const PACKAGE_PRICES = {
  pack_3: { count: 3, price: 5.0 },
  pack_5: { count: 5, price: 8.0 },
  pack_10: { count: 10, price: 15.0 },
  pack_30: { count: 30, price: 30.0 },
} as const;

export const PROMOTION_PRICES = {
  highlighted: { price: 1.5, duration: 7 },
  top_category: { price: 2.0, duration: 7 },
  vip: { price: 4.5, duration: 7 },
} as const;

export type PackageType = keyof typeof PACKAGE_PRICES;
export type PromotionType = keyof typeof PROMOTION_PRICES;
export type PaymentMethod = 'balance' | 'direct';

/**
 * Валідує тип пакету
 */
export function isValidPackageType(type: string): type is PackageType {
  return type in PACKAGE_PRICES;
}

/**
 * Валідує тип реклами
 */
export function isValidPromotionType(type: string): type is PromotionType {
  return type in PROMOTION_PRICES;
}
