export interface Seller {
  name: string;
  avatar: string;
  phone: string;
  telegramId?: string;
  username?: string | null;
}

export interface Listing {
  id: number;
  title: string;
  price: string;
  currency?: 'UAH' | 'EUR' | 'USD';
  image: string;
  images?: string[];
  seller: Seller;
  category: string;
  subcategory?: string;
  description: string;
  location: string;
  views: number;
  posted: string;
  createdAt?: string;
  condition?: 'new' | 'used';
  tags?: string[];
  isFree?: boolean;
  status?: 'active' | 'sold' | 'hidden' | 'pending' | 'pending_moderation' | 'rejected' | 'expired';
  moderationStatus?: 'pending' | 'rejected' | null;
  rejectionReason?: string;
  promotionType?: 'highlighted' | 'top_category' | 'vip' | null;
  promotionEnds?: string | null;
  expiresAt?: string | null;
  favoritesCount?: number;
}

export interface Subcategory {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  subcategories?: Subcategory[];
}

