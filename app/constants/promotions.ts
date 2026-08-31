export type PromotionType = 'highlighted' | 'top_category' | 'vip';

export type PromotionOption = {
  type: PromotionType;
  price: number;
  duration: number;
  badge?: 'recommended';
};

export const PROMOTION_OPTIONS: PromotionOption[] = [
  { type: 'highlighted', price: 1.5, duration: 7 },
  { type: 'top_category', price: 2.0, duration: 7 },
  { type: 'vip', price: 4.5, duration: 7, badge: 'recommended' },
];
