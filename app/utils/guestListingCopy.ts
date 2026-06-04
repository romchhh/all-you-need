import ru from '@/locales/ru.json';

/** Тексти вікна товару для незареєстрованих (браузер / SEO) — завжди російською. */
export const guestListingCopy = {
  viewHint:
    ru.listingDetail?.guestViewHint ??
    'Полный просмотр товара, актуальный статус и связь с продавцом доступны в Telegram-боте Trade Ground Marketplace.',
  openInTelegramBot:
    ru.listingDetail?.openInTelegramBot ?? 'Открыть товар в\nTelegram-боте',
  loading: ru.listingDetail?.guestLoading ?? 'Загрузка товара...',
  notFound: ru.listingDetail?.guestNotFound ?? 'Товар не найден или уже неактивен.',
  notFoundHint:
    ru.listingDetail?.guestNotFoundHint ??
    'Актуальный статус объявления можно проверить в нашем Telegram-боте Trade Ground Marketplace.',
  backToMarket: ru.listingDetail?.guestBackToMarket ?? 'Вернуться на маркет',
  openTelegramBotShort: ru.listingDetail?.guestOpenTelegramBotShort ?? 'Открыть\nTelegram-бот',
} as const;
