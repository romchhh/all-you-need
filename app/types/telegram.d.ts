export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

interface TelegramInitData {
  user?: TelegramUser;
  query_id?: string;
  auth_date?: number;
  hash?: string;
}

export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  showAlert(message: string): void;
  openTelegramLink(url: string): void;
  initData?: string;
  initDataUnsafe?: TelegramInitData;
  MainButton: {
    show(): void;
    hide(): void;
    setText(text: string): void;
    onClick(callback: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

interface Telegram {
  WebApp: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: Telegram;
  }
}

export {};

