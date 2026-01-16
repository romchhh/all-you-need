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
    <div className="fixed inset-0 bg-black/50 z-[70] flex flex-col">
      <div className="bg-[#000000] w-full h-full flex flex-col border-2 border-white">
        {/* Заголовок */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/20 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">
            {t('payment.summary') || 'Підтвердження оплати'}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={20} className="text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {/* Деталі замовлення */}
          <div className="bg-[#1C1C1C] rounded-2xl p-4 space-y-3 border border-white/20">
            <h3 className="font-semibold text-white mb-3">
              {t('payment.orderDetails') || 'Деталі замовлення'}
            </h3>

            {packageType && (
              <div className="flex justify-between items-center">
                <span className="text-white/70">
                  {t('payment.package') || 'Пакет'}: {getPackageName(packageType)}
                </span>
                <span className="font-semibold text-white">{packagePrice} €</span>
              </div>
            )}

            {promotionType && (
              <div className="flex justify-between items-center">
                <span className="text-white/70">
                  {t('payment.promotion') || 'Просування'}: {getPromotionName(promotionType)}
                </span>
                <span className="font-semibold text-white">{promotionPrice} €</span>
              </div>
            )}

            <div className="border-t border-white/20 pt-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-lg">
                  {t('payment.total') || 'Всього'}
                </span>
                <span className="font-bold text-[#D3F1A7] text-xl">{totalPrice} €</span>
              </div>
            </div>
          </div>

          {/* Баланс користувача */}
          <div className="bg-[#1C1C1C] rounded-2xl p-4 border border-white/20">
            <div className="flex justify-between items-center">
              <span className="text-white/70">
                {t('payment.yourBalance') || 'Ваш баланс'}
              </span>
              <span className="font-semibold text-[#D3F1A7] text-lg">{userBalance.toFixed(2)} €</span>
            </div>
          </div>

          {/* Вибір способу оплати */}
          <div className="space-y-3">
            <h3 className="font-semibold text-white">
              {t('payment.paymentMethod') || 'Спосіб оплати'}
            </h3>

            {/* Оплата з балансу */}
            <button
              onClick={() => setPaymentMethod('balance')}
              disabled={!canPayWithBalance}
              className={`w-full p-4 rounded-2xl border-2 transition-all ${
                paymentMethod === 'balance'
                  ? 'border-[#D3F1A7] bg-[#D3F1A7]/20'
                  : 'border-white/20 bg-[#1C1C1C]'
              } ${!canPayWithBalance ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'balance' ? 'border-[#D3F1A7]' : 'border-white/30'
                  }`}>
                    {paymentMethod === 'balance' && (
                      <div className="w-3 h-3 rounded-full bg-[#D3F1A7]" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white">
                      {t('payment.payFromBalance') || 'Оплатити з балансу'}
                    </div>
                    {!canPayWithBalance && (
                      <div className="text-sm text-red-400">
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
                  ? 'border-[#D3F1A7] bg-[#D3F1A7]/20'
                  : 'border-white/20 bg-[#1C1C1C]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'direct' ? 'border-[#D3F1A7]' : 'border-white/30'
                  }`}>
                    {paymentMethod === 'direct' && (
                      <div className="w-3 h-3 rounded-full bg-[#D3F1A7]" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white">
                      {t('payment.payDirect') || 'Оплатити зараз'}
                    </div>
                    <div className="text-sm text-white/70">
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
        <div className="border-t border-white/20 px-4 py-4 space-y-3 flex-shrink-0">
          <button
            onClick={() => onConfirm(paymentMethod)}
            disabled={paymentMethod === 'balance' && !canPayWithBalance}
            className="w-full px-4 py-4 bg-[#D3F1A7] text-black rounded-2xl text-base font-semibold hover:bg-[#D3F1A7]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('payment.confirm') || `Підтвердити оплату ${totalPrice} €`}
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-transparent border border-white/20 text-white rounded-2xl text-base font-medium hover:bg-white/10 transition-colors"
          >
            {t('common.cancel') || 'Скасувати'}
          </button>
        </div>
      </div>
    </div>
  );
};
