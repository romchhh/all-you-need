'use client';

import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';

interface PaymentSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: 'balance' | 'direct') => void;
  packageType?: string | null;
  promotionType?: string | null;
  userBalance?: number;
  tg: TelegramWebApp | null;
}

const PACKAGE_PRICES: Record<string, number> = {
  'single_1': 2.0,
  'pack_5': 8.0,
  'pack_10': 14.0,
};

const PROMOTION_PRICES: Record<string, number> = {
  'highlighted': 1.5,
  'top_category': 2.0,
  'vip': 4.5,
};

export const PaymentSummaryModal = ({
  isOpen,
  onClose,
  onConfirm,
  packageType,
  promotionType,
  userBalance = 0,
  tg
}: PaymentSummaryModalProps) => {
  const { t } = useLanguage();
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'direct'>('balance');

  // Блокуємо скрол при відкритті модального вікна
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const packagePrice = packageType ? PACKAGE_PRICES[packageType] || 0 : 0;
  const promotionPrice = promotionType ? PROMOTION_PRICES[promotionType] || 0 : 0;
  const totalPrice = packagePrice + promotionPrice;
  const canPayWithBalance = userBalance >= totalPrice;

  const getPackageName = (type: string) => {
    const names: Record<string, string> = {
      'single_1': t('listingPackages.single') || '1 оголошення',
      'pack_5': t('listingPackages.pack5') || '5 оголошень',
      'pack_10': t('listingPackages.pack10') || '10 оголошень',
    };
    return names[type] || type;
  };

  const getPromotionName = (type: string) => {
    const names: Record<string, string> = {
      'highlighted': t('promotions.highlighted') || 'Виділення',
      'top_category': t('promotions.top_category') || 'ТОП категорії',
      'vip': t('promotions.vip') || 'VIP',
    };
    return names[type] || type;
  };

  return (
    <div className="fixed inset-0 bg-white z-[70] flex flex-col">
      <div className="bg-white w-full h-full flex flex-col">
        {/* Заголовок */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">
            {t('payment.summary') || 'Підтвердження оплати'}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-900" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {/* Деталі замовлення */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 mb-3">
              {t('payment.orderDetails') || 'Деталі замовлення'}
            </h3>

            {packageType && (
              <div className="flex justify-between items-center">
                <span className="text-gray-700">
                  {t('payment.package') || 'Пакет'}: {getPackageName(packageType)}
                </span>
                <span className="font-semibold text-gray-900">{packagePrice} €</span>
              </div>
            )}

            {promotionType && (
              <div className="flex justify-between items-center">
                <span className="text-gray-700">
                  {t('payment.promotion') || 'Просування'}: {getPromotionName(promotionType)}
                </span>
                <span className="font-semibold text-gray-900">{promotionPrice} €</span>
              </div>
            )}

            <div className="border-t border-gray-300 pt-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 text-lg">
                  {t('payment.total') || 'Всього'}
                </span>
                <span className="font-bold text-blue-600 text-xl">{totalPrice} €</span>
              </div>
            </div>
          </div>

          {/* Баланс користувача */}
          <div className="bg-blue-50 rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">
                {t('payment.yourBalance') || 'Ваш баланс'}
              </span>
              <span className="font-semibold text-blue-600 text-lg">{userBalance.toFixed(2)} €</span>
            </div>
          </div>

          {/* Вибір способу оплати */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">
              {t('payment.paymentMethod') || 'Спосіб оплати'}
            </h3>

            {/* Оплата з балансу */}
            <button
              onClick={() => setPaymentMethod('balance')}
              disabled={!canPayWithBalance}
              className={`w-full p-4 rounded-2xl border-2 transition-all ${
                paymentMethod === 'balance'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white'
              } ${!canPayWithBalance ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'balance' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {paymentMethod === 'balance' && (
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">
                      {t('payment.payFromBalance') || 'Оплатити з балансу'}
                    </div>
                    {!canPayWithBalance && (
                      <div className="text-sm text-red-500">
                        {t('payment.insufficientBalance') || 'Недостатньо коштів'}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-2xl">💳</span>
              </div>
            </button>

            {/* Пряма оплата */}
            <button
              onClick={() => setPaymentMethod('direct')}
              className={`w-full p-4 rounded-2xl border-2 transition-all ${
                paymentMethod === 'direct'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'direct' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {paymentMethod === 'direct' && (
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">
                      {t('payment.payDirect') || 'Оплатити зараз'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {t('payment.payDirectDesc') || 'Через Monobank'}
                    </div>
                  </div>
                </div>
                <span className="text-2xl">🏦</span>
              </div>
            </button>
          </div>
        </div>

        {/* Кнопки */}
        <div className="border-t border-gray-200 px-4 py-4 space-y-3 flex-shrink-0">
          <button
            onClick={() => onConfirm(paymentMethod)}
            disabled={paymentMethod === 'balance' && !canPayWithBalance}
            className="w-full px-4 py-4 bg-blue-500 text-white rounded-2xl text-base font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('payment.confirm') || `Підтвердити оплату ${totalPrice} €`}
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-2xl text-base font-medium hover:bg-gray-200 transition-colors"
          >
            {t('common.cancel') || 'Скасувати'}
          </button>
        </div>
      </div>
    </div>
  );
};
