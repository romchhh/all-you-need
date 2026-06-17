export type Currency = 'UAH' | 'EUR' | 'USD';

export const getCurrencySymbol = (currency?: Currency): string => {
  switch (currency) {
    case 'UAH':
      return '₴';
    case 'EUR':
      return '€';
    case 'USD':
      return '$';
    default:
      return '₴'; // За замовчуванням гривня
  }
};

