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
  status?: 'active' | 'sold' | 'hidden' | 'pending';
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

